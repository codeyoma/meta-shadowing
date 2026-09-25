import { subtitleSpans } from './subtitle-mask';

export type WordRange = { start: number; end: number };
export type WordTokenizer = (text: string) => readonly WordRange[];
export type LookupSpan = { text: string; hint: boolean; term?: string };

/** Keep every character. Only fully visible, native-tokenized words get actions. */
export function lookupSpans(text: string, masked: boolean, tokenize: WordTokenizer): LookupSpan[] {
  return (masked ? subtitleSpans(text) : [{ text, hint: true }]).flatMap(span => {
    if (!span.hint) return [span];
    const parts: LookupSpan[] = [];
    let cursor = 0;
    for (const { start, end } of tokenize(span.text)) {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > span.text.length) continue;
      if (start > cursor) parts.push({ text: span.text.slice(cursor, start), hint: true });
      const term = span.text.slice(start, end);
      parts.push({ text: term, hint: true, ...(/[\p{L}\p{N}]/u.test(term) ? { term } : {}) });
      cursor = end;
    }
    if (cursor < span.text.length) parts.push({ text: span.text.slice(cursor), hint: true });
    return parts;
  });
}
