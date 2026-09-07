// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The standalone Node CLI exports pure mapping and streaming functions for verification.
import { importKaikkiStream, mapKaikkiRecord, parseImportArguments } from "../../scripts/import-kaikki.mjs";

const source = {
  word: "school", lang_code: "en", pos: "noun",
  senses: [{ glosses: ["학교", "", "학교"], examples: [{ text: "I go to school.", translation: "나는 학교에 간다." }] }],
  forms: [{ form: "schools", tags: ["plural"] }, { form: "gakkou", tags: ["romanization"] }],
  sounds: [{ ipa: "/skuːl/" }, { audio: "excluded.ogg" }], translations: [{ word: "unrelated" }]
};
const temporaryDirectories: string[] = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("Kaikki mapping", () => {
  it("keeps Korean meanings, examples, IPA, attribution, and only real source lookup forms", () => {
    const mapped = mapKaikkiRecord(source, "ko-2026-09-01");
    expect(mapped.lookup_keys).toEqual(["school", "schools"]);
    expect(mapped.entry).toEqual({
      headword: "school", language: "en", pos: "noun", senses: [{ glosses: ["학교"],
        examples: [{ text: "I go to school.", translation: "나는 학교에 간다." }] }],
      pronunciations: [{ ipa: "/skuːl/" }], sourceUrl: "https://ko.wiktionary.org/wiki/school", license: "CC BY-SA 4.0"
    });
    expect(mapped.source_dump).toBe("ko-2026-09-01");
  });

  it.each(["en", "ja", "zh", "es", "de", "fr"])("accepts Korean-edition definitions for %s", (language) => {
    expect(mapKaikkiRecord({ ...source, lang_code: language }).language).toBe(language);
  });

  it("skips other languages and entries without Korean glosses", () => {
    expect(mapKaikkiRecord({ ...source, lang_code: "ko" })).toBeNull();
    expect(mapKaikkiRecord({ ...source, senses: [{ glosses: ["", "school"] }] })).toBeNull();
    expect(mapKaikkiRecord({ ...source, senses: [] })).toBeNull();
    expect(mapKaikkiRecord(null)).toBeNull();
  });

  it("keeps entry identities stable across a gloss correction and distinguishes homographs", () => {
    const revised = { ...source, senses: [{ glosses: ["학교, 학원"] }] };
    expect(mapKaikkiRecord(revised).id).toBe(mapKaikkiRecord(source).id);
    expect(mapKaikkiRecord(source, "dump", 1).id).not.toBe(mapKaikkiRecord(source, "dump", 0).id);
    expect(mapKaikkiRecord({ ...source, pos: "verb" }).id).not.toBe(mapKaikkiRecord(source).id);
  });

  it("encodes Japanese source links and does not derive a lemma from form_of", () => {
    const mapped = mapKaikkiRecord({ word: "学校", lang_code: "ja", pos: "noun",
      senses: [{ glosses: ["학교; 학원"], form_of: [{ word: "other" }] }] });
    expect(mapped.lookup_keys).toEqual(["学校"]);
    expect(mapped.entry.sourceUrl).toBe("https://ko.wiktionary.org/wiki/%E5%AD%A6%E6%A0%A1");
  });
});

describe("streamed import", () => {
  it("handles split UTF-8 chunks, batching, skipped rows, and distinct repeated headword entries", async () => {
    const bytes = Buffer.from([source, { ...source, lang_code: "ko" }, source].map((row) => JSON.stringify(row)).join("\r\n"));
    const writeBatch = vi.fn(async () => {});
    const summary = await importKaikkiStream(Readable.from([bytes.subarray(0, 63), bytes.subarray(63, 65), bytes.subarray(65)]), {
      batchSize: 1, writeBatch, sourceDump: "fixture"
    });
    expect(summary).toMatchObject({ read: 3, accepted: 2, skipped: 1, written: 2, senses: 2, mode: "write" });
    expect(writeBatch).toHaveBeenCalledTimes(2);
    const calls = writeBatch.mock.calls as unknown as [{ id: string; entry: { senses: { glosses: string[] }[] } }[]][];
    expect(calls[0][0][0].entry.senses[0].glosses).toEqual(["학교"]);
    expect(calls[0][0][0].id).not.toBe(calls[1][0][0].id);
  });

  it("reports dry-run counts without a writer and stops at the explicit accepted-entry limit", async () => {
    const stream = Readable.from([`${JSON.stringify(source)}\n${JSON.stringify(source)}\n`]);
    expect(await importKaikkiStream(stream, { limit: 1 })).toMatchObject({ mode: "dry-run", accepted: 1, written: 0, limited: true });
  });

  it("fails on malformed JSON instead of silently skipping it", async () => {
    await expect(importKaikkiStream(Readable.from([`${JSON.stringify(source)}\n{private-invalid-content`]))).rejects.toThrow("Invalid JSON on line 2");
  });

  it("runs the CLI on local gzip without reading database credentials", () => {
    const directory = mkdtempSync(join(tmpdir(), "kaikki-test-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "fixture.jsonl.gz");
    writeFileSync(file, gzipSync(JSON.stringify(source)));
    const result = spawnSync(process.execPath, ["scripts/import-kaikki.mjs", "--file", file, "--dry-run"], {
      encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, SUPABASE_SECRET_KEY: "never-print-this-test-secret" }
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "dry-run", accepted: 1, written: 0 });
    expect(result.stdout + result.stderr).not.toContain("never-print-this-test-secret");
  });

  it("requires explicit write and rejects contradictory or unbounded batch options", () => {
    expect(parseImportArguments([]).write).toBe(false);
    expect(parseImportArguments(["--write"]).write).toBe(true);
    expect(() => parseImportArguments(["--write", "--dry-run"])).toThrow();
    expect(() => parseImportArguments(["--batch-size", "1001"])).toThrow();
    expect(() => parseImportArguments(["--limit", "0"])).toThrow();
  });
});
