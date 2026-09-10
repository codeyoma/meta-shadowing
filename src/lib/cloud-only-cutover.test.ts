import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}

test("only audited device-learning, lesson-package and MP3 modules access persistent browser storage", () => {
  const auditedStorageModules = ["src/lib/device-learning-store.ts", "src/lib/lesson-package-store.ts", "src/lib/mp3-cache.ts", "src/lib/device-access.ts"];
  const violations = sources("src").filter(path => !auditedStorageModules.includes(path))
    .filter(path => /\b(localStorage|sessionStorage|indexedDB)\b|\bcaches\s*[.[]/.test(readFileSync(path, "utf8")));
  expect(violations).toEqual([]);
});
