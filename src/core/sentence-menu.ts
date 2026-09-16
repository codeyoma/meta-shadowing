import type { LearningUnit } from './learning-units';
type Source = { text: string; translation: string; section?: number };
export type SentenceSection = { title: string | null; rows: (Source & { sourceIndex: number; unitIndex: number })[] };
export function initiallyCollapsedSections(sections: readonly SentenceSection[]) {
  return new Set(sections.flatMap((section, index) => section.title ? [index] : []));
}
/** Contiguous section runs preserve source order, including unsectioned passages. */
export function sentenceSections(phrases: readonly Source[], units: readonly LearningUnit[]): SentenceSection[] {
  const membership = new Map(units.flatMap((unit, index) => unit.sourceIndices.map(source => [source, index] as const)));
  const groups: SentenceSection[] = [];
  phrases.forEach((phrase, sourceIndex) => {
    const title = typeof phrase.section === 'number' && Number.isFinite(phrase.section) ? `Section ${phrase.section}` : null;
    let group = groups.at(-1);
    if (!group || group.title !== title) { group = { title, rows: [] }; groups.push(group); }
    group.rows.push({ ...phrase, sourceIndex, unitIndex: membership.get(sourceIndex) ?? -1 });
  });
  return groups;
}
