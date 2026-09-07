export const DICTIONARY_LANGUAGES = ["en", "ja", "zh", "es", "de", "fr"] as const;
export type DictionaryLanguage = typeof DICTIONARY_LANGUAGES[number];
export type DictionaryExample = { text: string; translation?: string };
export type DictionarySense = { glosses: string[]; examples?: DictionaryExample[] };
export type DictionaryEntry = {
  headword: string;
  language: string;
  pos: string;
  senses: DictionarySense[];
  pronunciations?: { ipa: string }[];
  sourceUrl: string;
  license: string;
  matchType?: "lemma";
};
export type DictionaryResponse = { word: string; entries: DictionaryEntry[] };

export const DICTIONARY_WORD_LIMIT = 80;
export const DICTIONARY_ENTRY_LIMIT = 12;
export const DICTIONARY_LICENSE = "CC BY-SA 4.0";
export const DICTIONARY_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

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

function string(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

/** Validate stored JSON and bound response size without passing arbitrary fields to the browser. */
export function decodeDictionaryEntry(value: unknown, language: DictionaryLanguage): DictionaryEntry | null {
  if (!record(value) || value.language !== language || !Array.isArray(value.senses)) return null;
  const headword = string(value.headword, 160);
  const pos = string(value.pos, 80);
  if (!headword || !pos || value.license !== DICTIONARY_LICENSE) return null;
  const sourceUrl = `https://ko.wiktionary.org/wiki/${encodeURIComponent(headword.replace(/ /g, "_"))}`;
  if (value.sourceUrl !== sourceUrl) return null;
  const senses: DictionarySense[] = [];
  for (const candidate of value.senses.slice(0, 32)) {
    if (!record(candidate) || !Array.isArray(candidate.glosses)) continue;
    const glosses = candidate.glosses.slice(0, 8).map((gloss) => string(gloss, 2000)).filter((gloss): gloss is string => Boolean(gloss));
    if (!glosses.length) continue;
    const examples: DictionaryExample[] = [];
    if (Array.isArray(candidate.examples)) {
      for (const example of candidate.examples.slice(0, 4)) {
        if (!record(example)) continue;
        const text = string(example.text, 1000);
        const translation = string(example.translation, 1000);
        if (text) examples.push({ text, ...(translation ? { translation } : {}) });
      }
    }
    senses.push({ glosses, ...(examples.length ? { examples } : {}) });
  }
  if (!senses.length) return null;
  const pronunciations = Array.isArray(value.pronunciations)
    ? value.pronunciations.slice(0, 8).flatMap((sound) => {
      const ipa = record(sound) ? string(sound.ipa, 120) : null;
      return ipa ? [{ ipa }] : [];
    }) : [];
  return { headword, language, pos, senses, sourceUrl, license: DICTIONARY_LICENSE,
    ...(pronunciations.length ? { pronunciations } : {}) };
}
