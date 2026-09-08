#!/usr/bin/env node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { mapKaikkiRecord } from "./import-kaikki.mjs";
import { decodeDictionaryEntry, parseDictionaryWord } from "../src/lib/dictionary.ts";

const languageNames = { en: "영어", ja: "일본어", zh: "중국어", es: "스페인어", de: "독일어", fr: "프랑스어" };
const partsOfSpeech = { 명사: "noun", 동사: "verb", 타동사: "verb", 자동사: "verb", 형용사: "adj", 부사: "adv",
  대명사: "pron", 전치사: "prep", 접속사: "conj", 감탄사: "intj", 관사: "article", 수사: "num" };
const clean = value => (value ?? "").replace(/\s+/g, " ").trim();
const heading = node => node.matches("h2,h3,h4,h5,h6") ? node : node.querySelector("h2,h3,h4,h5,h6");
const headingPos = text => partsOfSpeech[clean(text).replace(/\s*\d+$/, "")];
class SupplementError extends Error {}

/** Only recover unheaded definitions with one unambiguous category POS.
 * Rendered source text is retained; no translation or sentence POS inference runs. */
export function supplementKoreanWiktionaryPage(page, language) {
  if (!languageNames[language] || !page || !parseDictionaryWord(page.title)
    || !Number.isSafeInteger(page.revid) || page.revid <= 0 || typeof page.text !== "string"
    || Buffer.byteLength(page.text) > 2 * 1024 * 1024 || !Array.isArray(page.categories)) {
    throw new SupplementError("Invalid or oversized Korean Wiktionary source page.");
  }
  const dom = new JSDOM(page.text);
  try {
    const root = dom.window.document.querySelector(".mw-parser-output");
    if (!root) throw new SupplementError("Korean Wiktionary source layout is unsupported.");
    const children = [...root.children];
    const starts = children.flatMap((node, index) => {
      const title = heading(node);
      return title?.tagName === "H2" && clean(title.textContent) === languageNames[language] ? [index] : [];
    });
    if (!starts.length) return [];
    if (starts.length !== 1) throw new SupplementError("Duplicate language sections require manual review.");
    const section = [];
    for (const node of children.slice(starts[0] + 1)) {
      if (heading(node)?.tagName === "H2") break;
      section.push(node);
    }
    const explicitPos = new Set(section.map(node => headingPos(heading(node)?.textContent)).filter(Boolean));
    const categories = new Set(page.categories.flatMap(category => {
      const name = clean(category.category).replace(/_/g, " ");
      if (!name.startsWith(`${languageNames[language]} `)) return [];
      const pos = headingPos(name.slice(languageNames[language].length + 1));
      return pos && !explicitPos.has(pos) ? [pos] : [];
    }));
    const senses = [];
    const sounds = [];
    for (const node of section) {
      if (heading(node)) break;
      for (const ipa of node.querySelectorAll(".IPA")) sounds.push({ ipa: clean(ipa.textContent) });
      if (node.tagName === "OL") {
        for (const item of node.children) {
          if (item.tagName !== "LI") continue;
          // Nested lists can mix subsenses and citations; stop rather than misattribute them.
          if (item.querySelector("ol,ul,dl")) throw new SupplementError("Nested unheaded definitions require manual review.");
          const gloss = clean(item.textContent);
          if (/\p{Script=Hangul}/u.test(gloss)) senses.push({ glosses: [gloss] });
        }
      } else if (senses.length && (node.tagName === "DL" || node.tagName === "UL")) {
        const examples = [...node.querySelectorAll("li")].filter(item => !item.querySelector("li"))
          .map(item => ({ text: clean(item.textContent) })).filter(item => item.text);
        if (examples.length) {
          const sense = senses.at(-1);
          sense.examples = [...(sense.examples ?? []), ...examples];
        }
      }
    }
    if (!senses.length) return [];
    if (categories.size !== 1) throw new SupplementError("Unheaded definition POS is ambiguous; manual source review is required.");
    const pos = [...categories][0];
    const revisionUrl = `https://ko.wiktionary.org/w/index.php?title=${encodeURIComponent(page.title.replace(/ /g, "_"))}&oldid=${page.revid}`;
    const row = mapKaikkiRecord({ word: page.title, lang_code: language, pos, senses, sounds }, revisionUrl);
    if (!row) throw new SupplementError("No valid Korean definitions were extracted.");
    row.id = `kowiktionary-supplement:${createHash("sha256").update(JSON.stringify([language, page.title, "unheaded", pos])).digest("hex")}`;
    row.entry.sourceUrl = revisionUrl;
    if (!decodeDictionaryEntry(row.entry, language)) throw new SupplementError("Supplement exceeds the dictionary entry contract.");
    return [row];
  } finally { dom.window.close(); }
}

export function parseSupplementArguments(args) {
  const options = { language: null, pages: [], write: false, expectedProject: null, help: false };
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") { options.help = true; continue; }
    if (argument === "--write") { options.write = true; continue; }
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (!["--language", "--page", "--expect-project"].includes(argument)) throw new SupplementError("Unknown option; use --help.");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new SupplementError("Missing option value; use --help.");
    if (argument === "--language") options.language = value;
    if (argument === "--expect-project") options.expectedProject = value;
    if (argument === "--page") {
      const split = value.lastIndexOf("@");
      const word = value.slice(0, split);
      const revision = Number(value.slice(split + 1));
      if (split < 1 || !parseDictionaryWord(word) || !Number.isSafeInteger(revision) || revision <= 0) {
        throw new SupplementError("Each --page must pin a word and revision, for example respect@4365701.");
      }
      options.pages.push({ word, revision });
    }
  }
  if (options.help) return options;
  if (!Object.hasOwn(languageNames, options.language) || !options.pages.length || options.pages.length > 10) {
    throw new SupplementError("Choose one supported language and 1–10 explicitly pinned source pages.");
  }
  if (options.write && dryRun) throw new SupplementError("Choose either --dry-run or --write.");
  if (options.write && !/^[a-z0-9]{20}$/.test(options.expectedProject ?? "")) {
    throw new SupplementError("Writes require --expect-project with the intended Supabase project ref.");
  }
  return options;
}

async function loadSourcePage({ revision }) {
  const url = new URL("https://ko.wiktionary.org/w/api.php");
  url.search = new URLSearchParams({ action: "parse", oldid: String(revision), prop: "text|categories|revid",
    format: "json", formatversion: "2", maxlag: "5" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "meta-shadowing-dictionary-maintenance/1.0" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new SupplementError(`Korean Wiktionary request failed (HTTP ${response.status}).`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 3 * 1024 * 1024) throw new SupplementError("Korean Wiktionary response exceeds the source budget.");
  const body = JSON.parse(text);
  if (body.error || !body.parse) throw new SupplementError("Korean Wiktionary revision is unavailable.");
  return body.parse;
}

export async function importKoreanWiktionarySupplements(options, { loadPage = loadSourcePage, writeRows } = {}) {
  const rows = new Map();
  for (const target of options.pages) {
    const page = await loadPage(target);
    if (page.title !== target.word || page.revid !== target.revision) {
      throw new SupplementError("Source title or revision does not match the explicitly requested page.");
    }
    const supplements = supplementKoreanWiktionaryPage(page, options.language);
    if (options.write && supplements.length !== 1) {
      throw new SupplementError("Writes require exactly one supplement for every explicitly requested page; no rows were changed.");
    }
    for (const row of supplements) {
      if (rows.has(row.id)) throw new SupplementError("Duplicate supplement targets require review.");
      rows.set(row.id, row);
    }
  }
  const selected = [...rows.values()];
  let written = 0;
  if (options.write) {
    if (selected.length !== options.pages.length) {
      throw new SupplementError("Writes require exactly one supplement for every explicitly requested page; no rows were changed.");
    }
    if (!writeRows) throw new SupplementError("No database writer configured.");
    if (selected.length) written = await writeRows(selected);
  }
  return { mode: options.write ? "write" : "dry-run", pages: options.pages.length,
    accepted: selected.length, written, rows: selected };
}

async function main() {
  const options = parseSupplementArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Recover unheaded Korean Wiktionary definitions omitted by Kaikki. Node 24 and dev dependencies required.

node scripts/supplement-kowiktionary.mjs --language en --page respect@4365701 --dry-run
node --env-file=.env.local scripts/supplement-kowiktionary.mjs --language en --page respect@4365701 --write --expect-project PROJECT_REF

Repeat --page up to 10 times. Revisions are mandatory so a reviewed dry run is reproducible.
Dry runs fetch only the source pages and print the exact proposed rows, with no database access.
Writes only insert absent supplement IDs. Existing Kaikki rows and conflicting supplements are never overwritten.`);
    return;
  }
  let writeRows;
  if (options.write) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (url !== `https://${options.expectedProject}.supabase.co` || !secret) {
      throw new SupplementError("The loaded Supabase environment does not match --expect-project or lacks its secret key.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    writeRows = async rows => {
      const ids = rows.map(row => row.id);
      const readRows = async () => {
        const result = await supabase.from("dictionary_entries").select("id,entry,source_dump,lookup_keys")
          .in("id", ids).abortSignal(AbortSignal.timeout(30_000));
        if (result.error) throw new SupplementError("Supplement verification query failed.");
        return result.data ?? [];
      };
      const sameContent = (stored, row) => stored.source_dump === row.source_dump
        && JSON.stringify(stored.entry) === JSON.stringify(row.entry)
        && JSON.stringify(stored.lookup_keys) === JSON.stringify(row.lookup_keys);
      const existing = await readRows();
      // Postgres JSONB key order differs; compare normalized JSON objects.
      const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
      const equal = (stored, row) => sameContent(stored, row) || (stored.source_dump === row.source_dump
        && canonical(stored.entry) === canonical(row.entry) && canonical(stored.lookup_keys) === canonical(row.lookup_keys));
      if (existing.some(stored => !equal(stored, rows.find(row => row.id === stored.id)))) {
        throw new SupplementError("An existing supplement differs from this revision; no rows were changed. Review it separately.");
      }
      const missing = rows.filter(row => !existing.some(stored => stored.id === row.id));
      if (missing.length) {
        const { error } = await supabase.from("dictionary_entries").upsert(missing.map(row => ({ ...row, updated_at: new Date().toISOString() })),
          { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(30_000));
        if (error) throw new SupplementError("Supplement insert failed; rerun the same pinned pages to verify safely.");
      }
      const stored = await readRows();
      if (rows.some(row => !stored.some(value => value.id === row.id && equal(value, row)))) {
        throw new SupplementError("Stored supplement verification failed; inspect the exact supplement IDs before retrying.");
      }
      return missing.length;
    };
  }
  console.log(JSON.stringify(await importKoreanWiktionarySupplements(options, { writeRows }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof SupplementError ? error.message : "Korean Wiktionary supplement failed; no credentials are included in this error.");
    process.exitCode = 1;
  });
}
