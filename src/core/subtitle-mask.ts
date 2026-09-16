export type SubtitleSpan = { text: string; hint: boolean };
/** Keep every original character and offset; only sentence-leading words are hints. */
export function subtitleSpans(text: string): SubtitleSpan[] {
  const boundaries = text.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr)\.(?=\s+\p{L})/gu, value => value.slice(0, -1) + '\0')
    .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, '$1\0')
    .replace(/(\d)\.(?=\d)/g, '$1\0');
  const spans: SubtitleSpan[] = [];
  let cursor = 0;
  for (const sentence of boundaries.matchAll(/[^.!?。！？…]+/gu)) {
    const word = sentence[0].match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*/u);
    if (!word) continue;
    const start = sentence.index + word.index!;
    if (start > cursor) spans.push({ text: text.slice(cursor, start), hint: false });
    cursor = start + word[0].length;
    spans.push({ text: text.slice(start, cursor), hint: true });
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor), hint: false });
  return spans;
}
