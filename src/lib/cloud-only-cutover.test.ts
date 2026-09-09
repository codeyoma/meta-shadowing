import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}

test("production learning code has no persistent browser storage except the MP3 cache", () => {
  const violations = sources("src").filter(path => !path.endsWith("/mp3-cache.ts"))
    .filter(path => /\b(localStorage|sessionStorage|indexedDB)\b|\bcaches\s*[.[]/.test(readFileSync(path, "utf8")));
  expect(violations).toEqual([]);
});
