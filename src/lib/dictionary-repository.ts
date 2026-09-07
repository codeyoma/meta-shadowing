import "server-only";

import {
  decodeDictionaryEntry, DICTIONARY_ENTRY_LIMIT, normalizeDictionaryLookup,
  type DictionaryEntry, type DictionaryLanguage
} from "./dictionary";
import { createSecretSupabaseClient } from "./supabase/secret";
import { englishDictionaryLemmas } from "./dictionary-lemmas";

function decodeRows(rows: { entry: unknown }[] | null, language: DictionaryLanguage): DictionaryEntry[] {
  return (rows ?? []).map(row => {
    const entry = decodeDictionaryEntry(row.entry, language);
    if (!entry) throw new Error("Dictionary entry is invalid.");
    return entry;
  });
}

export async function lookupDictionaryEntries(language: DictionaryLanguage, word: string): Promise<DictionaryEntry[]> {
  const supabase = createSecretSupabaseClient();
  if (!supabase) throw new Error("Dictionary storage is unavailable.");
  const deadline = AbortSignal.timeout(5000);
  const { data, error } = await supabase.from("dictionary_entries")
    .select("entry").eq("language", language)
    .contains("lookup_keys", [normalizeDictionaryLookup(word)])
    .order("headword").order("id").limit(DICTIONARY_ENTRY_LIMIT)
    .abortSignal(deadline);
  if (error) throw new Error("Dictionary lookup failed.");
  const exact = decodeRows(data, language);
  if (language !== "en" || exact.length >= DICTIONARY_ENTRY_LIMIT) return exact;
  const existing = new Set(exact.map(entry => normalizeDictionaryLookup(entry.headword)));
  const candidates = englishDictionaryLemmas(word, exact.length === 0).filter(candidate => !existing.has(candidate.word));
  if (!candidates.length) return exact;

  try {
    const fallback = await supabase.from("dictionary_entries").select("entry").eq("language", language)
      .overlaps("lookup_keys", candidates.map(candidate => candidate.word))
      .order("headword").order("id").limit(DICTIONARY_ENTRY_LIMIT * candidates.length).abortSignal(deadline);
    if (fallback.error) throw new Error("Dictionary lookup failed.");
    const entries = decodeRows(fallback.data, language).filter(entry => {
      const candidate = candidates.find(value => value.word === normalizeDictionaryLookup(entry.headword));
      return candidate && (entry.pos === "unknown" || candidate.partsOfSpeech.includes(entry.pos === "adjective" ? "adj" : entry.pos));
    }).map(entry => ({ ...entry, matchType: "lemma" as const }));
    return [...exact, ...entries].slice(0, DICTIONARY_ENTRY_LIMIT);
  } catch (reason) {
    // A failed optional expansion must not hide a valid direct dictionary entry.
    if (exact.length) return exact;
    throw reason;
  }
}
