import { subtitleSpans } from './subtitle-mask';
import { isFirstWordStage, isRevealStage, type PlayableStage } from './catalog';
import { groupedSpeechBubbles } from './grouped-speech';
import type { LearningUnit } from './learning-units';
import { revealLines } from './word-reveal';

export type WordRange = { start: number; end: number };
export type WordTokenizer = (text: string) => readonly WordRange[];
export type LookupSpan = { text: string; hint: boolean; term?: string };

/** Revalidate requests against the current unit, using the renderer's visible spans. */
export function visibleLookupWords(unit: LearningUnit | undefined, stage: PlayableStage, revealed: boolean, tokenize: WordTokenizer,
  revealComplete = false): ReadonlySet<string> {
  if (!unit || (isRevealStage(stage) && !revealComplete)) return new Set();
  if (isRevealStage(stage)) return new Set(revealLines(unit, stage)
    .flatMap(line => lookupSpans(line.text, false, tokenize)).flatMap(span => span.term ? [span.term] : []));
  return new Set(groupedSpeechBubbles(unit.members).flat().flatMap(pair => [
    ...lookupSpans(pair.text, isFirstWordStage(stage) && !revealed, tokenize),
    ...lookupSpans(pair.translation, false, tokenize),
  ]).flatMap(span => span.term ? [span.term] : []));
}

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
