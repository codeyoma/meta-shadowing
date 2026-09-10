import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type { DictionaryResponse } from "../../src/lib/dictionary";
import type { PhraseSyntax } from "../../src/lib/phrase-syntax";
import type { PackageAcquisition } from "../../src/lib/lesson-package";

type Resources = { audio?: { bytes: Buffer; mimeType: string }; dictionary?: DictionaryResponse; syntax?: PhraseSyntax };
const fixtures = new WeakMap<Page, Resources>();
/** UI fixtures customize the authenticated acquisition boundary, never production
 * storage/verification. Media bytes and trusted descriptor always agree. */
export async function packageResources(page: Page, changes: Resources) {
  const previous = fixtures.get(page);
  fixtures.set(page, { ...previous, ...changes });
  if (previous) return;
  await page.route("**/api/lessons/*/package?*", async route => {
    const response = await route.fetch();
    if (!response.ok()) { await route.fulfill({ response }); return; }
    const acquisition = await response.json() as PackageAcquisition;
    const fixture = fixtures.get(page)!;
    if (fixture.audio) {
      const sha256 = createHash("sha256").update(fixture.audio.bytes).digest("hex");
      acquisition.manifest.audio = acquisition.manifest.audio.map(audio => ({ ...audio, assetId: `${audio.phraseNumber}:${sha256}`, sha256, size: fixture.audio!.bytes.length, mimeType: fixture.audio!.mimeType }));
    }
    if (fixture.dictionary) acquisition.manifest.dictionary[fixture.dictionary.word.toLowerCase()] = { status: fixture.dictionary.entries.length ? "available" : "unavailable", entries: fixture.dictionary.entries };
    if (fixture.syntax) acquisition.manifest.syntax = acquisition.manifest.syntax.map(phrase => phrase.phraseNumber === fixture.syntax!.phraseNumber
      ? { ...fixture.syntax!, status: fixture.syntax!.sentences.length ? "available" : "unavailable" } : phrase);
    acquisition.sha256 = createHash("sha256").update(JSON.stringify(acquisition.manifest)).digest("hex");
    await route.fulfill({ response, json: acquisition });
  });
}
