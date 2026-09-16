import { isGroupedStage, isPlayableStage, type PlayableStage } from './catalog';
export type GroupSize = 2 | 3 | 4;
export type LearningUnit = { sourceIndices: number[]; text: string; translation: string; firstWordHint: string;
  members: { text: string; translation: string; firstWordHint: string }[] };
export function isGroupSize(value: unknown): value is GroupSize { return value === 2 || value === 3 || value === 4; }

/** Deterministic sentence punctuation boundaries; source blocks remain one audio unit. */
export function firstWordHint(text: string): string {
  // Protect common titles, initials and decimal points without a platform-specific tokenizer.
  const normalized = text.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr)\.(?=\s+\p{L})/gu, value => value.slice(0, -1))
    .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, '$1')
    .replace(/(\d)\.(?=\d)/g, '$1');
  return normalized.split(/[.!?。！？…]+/u).flatMap(sentence => {
    const word = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*/u)?.[0];
    return word ? [`${word} …`] : [];
  }).join(' ');
}
export function learningUnits(phrases: readonly { text: string; translation: string }[], stage: PlayableStage, groupSize: GroupSize = 2): LearningUnit[] {
  if (!isPlayableStage(stage) || !isGroupSize(groupSize)) throw Error('Invalid learning unit plan.');
  const size = isGroupedStage(stage) ? groupSize : 1;
  const result: LearningUnit[] = [];
  for (let start = 0; start < phrases.length; start += size) {
    const members = phrases.slice(start, start + size);
    result.push({ sourceIndices: members.map((_, i) => start + i),
      members: members.map(p => ({ text: p.text, translation: p.translation, firstWordHint: firstWordHint(p.text) })),
      text: members.map(p => p.text).join('\n'), translation: members.map(p => p.translation).join('\n'),
      firstWordHint: members.map(p => firstWordHint(p.text)).join('\n') });
  }
  return result;
}
