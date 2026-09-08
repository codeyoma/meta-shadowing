export const DICTIONARY_LANGUAGES = ["en", "ja", "zh", "es", "de", "fr"] as const;
export type DictionaryLanguage = typeof DICTIONARY_LANGUAGES[number];
export type DictionaryExample = { text: string; translation?: string };
export type DictionaryTransitivity = "transitive" | "intransitive";
export type DictionarySense = { glosses: string[]; examples?: DictionaryExample[]; tags?: DictionaryTransitivity[] };
export type DictionaryEntry = {
  headword: string;
  language: string;
  pos: string;
  tags?: DictionaryTransitivity[];
  senses: DictionarySense[];
  pronunciations?: { ipa: string }[];
  sourceUrl: string;
  license: string;
  matchType?: "lemma";
};
export type DictionaryResponse = { word: string; entries: DictionaryEntry[] };

export const DICTIONARY_WORD_LIMIT = 80;
// Budgets fail explicitly instead of silently dropping meanings.
export const DICTIONARY_ENTRY_LIMIT = 256;
export const DICTIONARY_ENTRY_BYTES = 256 * 1024;
export const DICTIONARY_RESPONSE_BYTES = 1024 * 1024;
export const DICTIONARY_LICENSE = "CC BY-SA 4.0";
export const DICTIONARY_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

/** Exact explicit source tags only; never derives grammar from dictionary text. */
export function dictionaryTransitivityTags(value: unknown): DictionaryTransitivity[] {
  return Array.isArray(value) ? [...new Set(value.filter((tag): tag is DictionaryTransitivity =>
    tag === "transitive" || tag === "intransitive"))] : [];
}

const languageAliases: Record<string, DictionaryLanguage> = {
  en: "en", english: "en", ja: "ja", japanese: "ja", zh: "zh", chinese: "zh",
  es: "es", spanish: "es", de: "de", german: "de", fr: "fr", french: "fr"
};

export function parseDictionaryLanguage(value: string | null | undefined): DictionaryLanguage | null {
  if (!value) return null;
  return Object.hasOwn(languageAliases, value.toLowerCase()) ? languageAliases[value.toLowerCase()] : null;
}

/** Shared by the importer and lookup API; preserves accents and never invents a lemma. */
export function normalizeDictionaryLookup(word: string): string {
  return word.normalize("NFKC").trim().replace(/ +/g, " ")
    .replace(/[’ʼ]/g, "'").replace(/[‐‑]/g, "-").toLowerCase();
}

export function parseDictionaryWord(value: string | null | undefined): string | null {
  if (!value || value.length > DICTIONARY_WORD_LIMIT * 2 || [...value].length > DICTIONARY_WORD_LIMIT || /\p{C}/u.test(value)) return null;
  const word = value.normalize("NFKC").trim().replace(/ +/g, " ");
  if ([...word].length > DICTIONARY_WORD_LIMIT || !/\p{L}/u.test(word)
    || !/^[\p{L}\p{M}\p{N}'’ʼ.・· \-‐‑]+$/u.test(word)) return null;
  return word;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function string(value: unknown, limit = DICTIONARY_ENTRY_BYTES): string | null {
  return typeof value === "string" && value.trim() && value.length <= limit ? value.trim() : null;
}

/** Validate stored JSON and bound response size without passing arbitrary fields to the browser. */
export function decodeDictionaryEntry(value: unknown, language: DictionaryLanguage): DictionaryEntry | null {
  if (!record(value) || value.language !== language || !Array.isArray(value.senses)) return null;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > DICTIONARY_ENTRY_BYTES) return null;
  const headword = string(value.headword, 160);
  const pos = string(value.pos, 80);
  if (!headword || !pos || value.license !== DICTIONARY_LICENSE) return null;
  const canonicalUrl = `https://ko.wiktionary.org/wiki/${encodeURIComponent(headword.replace(/ /g, "_"))}`;
  const revisionPrefix = `https://ko.wiktionary.org/w/index.php?title=${encodeURIComponent(headword.replace(/ /g, "_"))}&oldid=`;
  const sourceUrl = string(value.sourceUrl, 1000);
  if (!sourceUrl || (sourceUrl !== canonicalUrl && !(sourceUrl.startsWith(revisionPrefix)
    && /^[1-9][0-9]*$/.test(sourceUrl.slice(revisionPrefix.length))))) return null;
  const senses: DictionarySense[] = [];
  for (const candidate of value.senses) {
    if (!record(candidate) || !Array.isArray(candidate.glosses)) continue;
    const glosses = candidate.glosses.map((gloss) => string(gloss)).filter((gloss): gloss is string => Boolean(gloss));
    if (!glosses.length) continue;
    const examples: DictionaryExample[] = [];
    if (Array.isArray(candidate.examples)) {
      for (const example of candidate.examples) {
        if (!record(example)) continue;
        const text = string(example.text);
        const translation = string(example.translation);
        if (text) examples.push({ text, ...(translation ? { translation } : {}) });
      }
    }
    const tags = dictionaryTransitivityTags(candidate.tags);
    senses.push({ glosses, ...(examples.length ? { examples } : {}), ...(tags.length ? { tags } : {}) });
  }
  if (!senses.length) return null;
  const pronunciations = Array.isArray(value.pronunciations)
    ? value.pronunciations.flatMap((sound) => {
      const ipa = record(sound) ? string(sound.ipa) : null;
      return ipa ? [{ ipa }] : [];
    }) : [];
  const tags = dictionaryTransitivityTags(value.tags);
  return { headword, language, pos, senses, sourceUrl, license: DICTIONARY_LICENSE,
    ...(tags.length ? { tags } : {}),
    ...(pronunciations.length ? { pronunciations } : {}) };
}
