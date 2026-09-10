import "server-only";

import {
  decodeDictionaryEntry, DICTIONARY_ENTRY_BYTES, DICTIONARY_ENTRY_LIMIT, DICTIONARY_RESPONSE_BYTES, normalizeDictionaryLookup,
  type DictionaryEntry, type DictionaryLanguage
} from "./dictionary";
import { createSecretSupabaseClient } from "./supabase/secret";
import { englishDictionaryLemmas } from "./dictionary-lemmas";

class DictionaryBudgetError extends Error {}

function checkBudget(entries: DictionaryEntry[]) {
  if (entries.length > DICTIONARY_ENTRY_LIMIT || new TextEncoder().encode(JSON.stringify(entries)).byteLength > DICTIONARY_RESPONSE_BYTES) {
    throw new DictionaryBudgetError("Dictionary result exceeds the response budget.");
  }
}

function decodeRows(rows: { entry: unknown }[] | null, language: DictionaryLanguage): DictionaryEntry[] {
  return (rows ?? []).map(row => {
    if (new TextEncoder().encode(JSON.stringify(row.entry)).byteLength > DICTIONARY_ENTRY_BYTES) {
      throw new DictionaryBudgetError("Dictionary entry exceeds the response budget.");
    }
    const entry = decodeDictionaryEntry(row.entry, language);
    if (!entry) throw new Error("Dictionary entry is invalid.");
    return entry;
  });
}

export async function lookupDictionaryEntries(language: DictionaryLanguage, word: string, options: { strict?: boolean; signal?: AbortSignal } = {}): Promise<DictionaryEntry[]> {
  const supabase = createSecretSupabaseClient();
  if (!supabase) throw new Error("Dictionary storage is unavailable.");
  const deadline = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
  async function readEntries(keys: string[], exactKey = false) {
    const entries: DictionaryEntry[] = [];
    const pageSize = 50;
    for (let offset = 0; ; offset += pageSize) {
      const query = supabase!.from("dictionary_entries").select("entry").eq("language", language);
      const filtered = exactKey ? query.contains("lookup_keys", keys) : query.overlaps("lookup_keys", keys);
      const { data, error } = await filtered.order("headword").order("id")
        .range(offset, offset + pageSize - 1).abortSignal(deadline);
      if (error) throw new Error("Dictionary lookup failed.");
      entries.push(...decodeRows(data, language));
      checkBudget(entries);
      if (!data || data.length < pageSize) return entries;
    }
  }
  const exact = await readEntries([normalizeDictionaryLookup(word)], true);
  const aliases = [...new Set(exact.map(entry => normalizeDictionaryLookup(entry.headword)))]
    .filter(headword => headword !== normalizeDictionaryLookup(word));
  if (aliases.length) {
    const known = new Set(exact.map(entry => JSON.stringify(entry)));
    for (const entry of await readEntries(aliases)) {
      if (!aliases.includes(normalizeDictionaryLookup(entry.headword))) continue;
      const identity = JSON.stringify(entry);
      if (!known.has(identity)) { exact.push(entry); known.add(identity); }
    }
    checkBudget(exact);
  }
  if (language !== "en") return exact;
  const existing = new Set(exact.map(entry => normalizeDictionaryLookup(entry.headword)));
  const candidates = englishDictionaryLemmas(word, exact.length === 0).filter(candidate => !existing.has(candidate.word));
  if (!candidates.length) return exact;

  try {
    const decoded = await readEntries(candidates.map(candidate => candidate.word));
    const resolved = new Set(decoded.filter(entry => {
      const candidate = candidates.find(value => value.word === normalizeDictionaryLookup(entry.headword));
      return candidate && (entry.pos === "unknown" || candidate.partsOfSpeech.includes(entry.pos === "adjective" ? "adj" : entry.pos));
    }).map(entry => normalizeDictionaryLookup(entry.headword)));
    const entries = decoded.filter(entry => resolved.has(normalizeDictionaryLookup(entry.headword)))
      .map(entry => ({ ...entry, matchType: "lemma" as const }));
    const complete = [...exact, ...entries];
    checkBudget(complete);
    return complete;
  } catch (reason) {
    // A failed optional expansion must not hide a valid direct dictionary entry.
    if (!options.strict && exact.length && !(reason instanceof DictionaryBudgetError)) return exact;
    throw reason;
  }
}
