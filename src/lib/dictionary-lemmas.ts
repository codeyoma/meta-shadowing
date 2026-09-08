import "server-only";
import lemmatize from "wink-lemmatizer";
import { normalizeDictionaryLookup, parseDictionaryWord } from "./dictionary";

export type DictionaryLemma = { word: string; partsOfSpeech: string[] };

/** POS is unknown at click time: propose candidates, then require real dictionary
 * entries of the corresponding POS. These are not contextual sense predictions. */
export function englishDictionaryLemmas(word: string, includeNouns = true): DictionaryLemma[] {
  const key = normalizeDictionaryLookup(word);
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(key)) return [];
  const candidates = new Map<string, Set<string>>();
  const conversions = [
    { convert: lemmatize.verb, pos: "verb" },
    ...(includeNouns ? [{ convert: lemmatize.noun, pos: "noun" }] : []),
    { convert: lemmatize.adjective, pos: "adj" }
  ];
  for (const { convert, pos } of conversions) {
    let base = convert(key);
    // Some compounds are absent from WordNet while their final part is known.
    // Keep the prefix intact: ex-girlfriends may yield ex-girlfriend, never girlfriend.
    const lastHyphen = key.lastIndexOf("-");
    if (base === key && lastHyphen >= 0) base = key.slice(0, lastHyphen + 1) + convert(key.slice(lastHyphen + 1));
    base = normalizeDictionaryLookup(base);
    if (base === key || !parseDictionaryWord(base)) continue;
    const parts = candidates.get(base) ?? new Set<string>();
    parts.add(pos);
    candidates.set(base, parts);
  }
  return [...candidates].map(([word, parts]) => ({ word, partsOfSpeech: [...parts] }));
}
