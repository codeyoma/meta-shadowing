#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import {
  DICTIONARY_LANGUAGES, DICTIONARY_LICENSE, normalizeDictionaryLookup, parseDictionaryWord
} from "../src/lib/dictionary.ts";

export const KAIKKI_DOWNLOAD_URL = "https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz";
const koreanText = /\p{Script=Hangul}/u;
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const clean = (value) => typeof value === "string" ? value.trim() : "";
const array = (value) => Array.isArray(value) ? value : [];

class ImportError extends Error {}

/** Occurrence distinguishes multiple same-headword/POS entries without hashing mutable gloss text. */
export function mapKaikkiRecord(raw, sourceDump = KAIKKI_DOWNLOAD_URL, occurrence = 0) {
  if (!record(raw) || !DICTIONARY_LANGUAGES.includes(raw.lang_code)) return null;
  const headword = clean(raw.word);
  if (!parseDictionaryWord(headword)) return null;
  const senses = array(raw.senses).flatMap((sense) => {
    if (!record(sense)) return [];
    const glosses = [...new Set(array(sense.glosses).map(clean).filter((gloss) => koreanText.test(gloss)))];
    if (!glosses.length) return [];
    const examples = array(sense.examples).flatMap((example) => {
      if (!record(example)) return [];
      const text = clean(example.text);
      const translation = clean(example.translation);
      return text ? [{ text, ...(translation ? { translation } : {}) }] : [];
    });
    return [{ glosses, ...(examples.length ? { examples } : {}) }];
  });
  if (!senses.length) return null;
  const pos = clean(raw.pos) || "unknown";
  const sourceUrl = `https://ko.wiktionary.org/wiki/${encodeURIComponent(headword.replace(/ /g, "_"))}`;
  const pronunciations = [...new Set(array(raw.sounds).map((sound) => record(sound) ? clean(sound.ipa) : "").filter(Boolean))]
    .map((ipa) => ({ ipa }));
  const entry = { headword, language: raw.lang_code, pos, senses, sourceUrl, license: DICTIONARY_LICENSE,
    ...(pronunciations.length ? { pronunciations } : {}) };
  const forms = array(raw.forms).flatMap((form) => {
    if (!record(form) || array(form.tags).some((tag) => /romaniz|translit|table-tags/i.test(tag))) return [];
    return [form.form];
  });
  const lookupKeys = [...new Set([headword, ...forms, ...array(raw.redirects)]
    .filter((form) => typeof form === "string" && parseDictionaryWord(form))
    .map(normalizeDictionaryLookup))].sort();
  const identity = JSON.stringify([raw.lang_code, headword, pos, occurrence]);
  return {
    id: `kowiktionary:${createHash("sha256").update(identity).digest("hex")}`,
    language: raw.lang_code, headword, lookup_keys: lookupKeys, entry, source_dump: sourceDump
  };
}

async function* jsonLines(stream) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let lineNumber = 0;
  for await (const chunk of stream) {
    pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      lineNumber += 1;
      if (line.length > 4 * 1024 * 1024) throw new ImportError(`JSONL line ${lineNumber} exceeds the size limit.`);
      if (line.trim()) yield { line, lineNumber };
    }
    if (pending.length > 4 * 1024 * 1024) throw new ImportError(`JSONL line ${lineNumber + 1} exceeds the size limit.`);
  }
  pending += decoder.end();
  if (pending.trim()) yield { line: pending, lineNumber: lineNumber + 1 };
}

export async function importKaikkiStream(stream, {
  sourceDump = KAIKKI_DOWNLOAD_URL, batchSize = 250, limit = Infinity, writeBatch
} = {}) {
  const summary = {
    mode: writeBatch ? "write" : "dry-run", sourceDump, read: 0, accepted: 0, skipped: 0,
    senses: 0, lookupKeys: 0, written: 0, limited: false,
    languages: Object.fromEntries(DICTIONARY_LANGUAGES.map((language) => [language, 0]))
  };
  const occurrences = new Map();
  let batch = [];
  async function flush() {
    if (!batch.length || !writeBatch) return;
    await writeBatch(batch);
    summary.written += batch.length;
    batch = [];
  }
  for await (const { line, lineNumber } of jsonLines(stream)) {
    let raw;
    try { raw = JSON.parse(line); }
    catch { throw new ImportError(`Invalid JSON on line ${lineNumber}; import stopped.`); }
    summary.read += 1;
    const row = mapKaikkiRecord(raw, sourceDump);
    if (!row) { summary.skipped += 1; continue; }
    const occurrence = occurrences.get(row.id) ?? 0;
    occurrences.set(row.id, occurrence + 1);
    const selected = occurrence ? mapKaikkiRecord(raw, sourceDump, occurrence) : row;
    summary.accepted += 1;
    summary.languages[selected.language] += 1;
    summary.senses += selected.entry.senses.length;
    summary.lookupKeys += selected.lookup_keys.length;
    if (writeBatch) batch.push({ ...selected, updated_at: new Date().toISOString() });
    if (batch.length >= batchSize) await flush();
    if (summary.accepted >= limit) { summary.limited = true; break; }
  }
  await flush();
  return summary;
}

export function parseImportArguments(args) {
  const options = { file: null, sourceDump: KAIKKI_DOWNLOAD_URL, batchSize: 250, limit: Infinity, write: false, help: false };
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") { options.help = true; continue; }
    if (argument === "--write") { options.write = true; continue; }
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (!["--file", "--source-dump", "--batch-size", "--limit"].includes(argument)) throw new ImportError("Unknown importer option. Use --help.");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new ImportError("An importer option is missing its value. Use --help.");
    if (argument === "--file") options.file = value;
    if (argument === "--source-dump") {
      if (value.length > 500 || /[\r\n]/.test(value)) throw new ImportError("Source dump identifier must be at most 500 characters.");
      options.sourceDump = value;
    }
    if (argument === "--batch-size" || argument === "--limit") {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 1 || (argument === "--batch-size" && number > 1000)) {
        throw new ImportError("Batch size must be 1–1000 and limit must be a positive integer.");
      }
      if (argument === "--batch-size") options.batchSize = number;
      else options.limit = number;
    }
  }
  if (dryRun && options.write) throw new ImportError("Choose either --dry-run or --write.");
  return options;
}

async function openSource(file) {
  let source;
  if (file) source = createReadStream(file);
  else {
    const response = await fetch(KAIKKI_DOWNLOAD_URL, {
      headers: { "User-Agent": "meta-shadowing-kaikki-import/1.0" }, signal: AbortSignal.timeout(300_000)
    });
    if (!response.ok || !response.body) throw new ImportError(`Kaikki download failed (HTTP ${response.status}).`);
    source = Readable.fromWeb(response.body);
  }
  if (!file || file.endsWith(".gz")) {
    const uncompressed = createGunzip();
    source.on("error", (error) => uncompressed.destroy(error));
    uncompressed.on("close", () => source.destroy());
    return source.pipe(uncompressed);
  }
  return source;
}

async function main() {
  const options = parseImportArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Import Korean meanings from Kaikki's Korean Wiktionary JSONL. Node 24 required.

node scripts/import-kaikki.mjs [--file dump.jsonl[.gz]] [--dry-run]
node --env-file=.env.local scripts/import-kaikki.mjs --write [--file dump.jsonl.gz]

--source-dump ID  Provenance identifier (default: official raw download URL).
--batch-size N    Rows per upsert, 1–1000 (default: 250).
--limit N         Stop after N accepted entries for a smoke check.
--write           Explicitly upsert dictionary_entries using SUPABASE_SECRET_KEY.
Without --write, only counts are produced and no database is contacted.`);
    return;
  }
  let writeBatch;
  if (options.write) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new ImportError("Import requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Load the intended environment with Node --env-file.");
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    writeBatch = async (rows) => {
      const { error } = await supabase.from("dictionary_entries").upsert(rows, { onConflict: "id" })
        .abortSignal(AbortSignal.timeout(30_000));
      if (error) throw new ImportError("Dictionary upsert failed. Earlier completed batches may remain; rerun the same dump to resume safely.");
    };
  }
  const stream = await openSource(options.file);
  try { console.log(JSON.stringify(await importKaikkiStream(stream, { ...options, writeBatch }), null, 2)); }
  finally { stream.destroy(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof ImportError ? error.message : "Kaikki import failed while reading or storing data. No credentials are included in this error.");
    process.exitCode = 1;
  });
}
