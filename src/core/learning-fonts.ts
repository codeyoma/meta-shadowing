/** Stable preference identifiers; only this curated set is offered, never a font enumeration. */
export const learningFonts = [
  { id: 'system', label: 'System', family: 'system-ui' },
  { id: 'rounded', label: 'Rounded', family: 'ui-rounded' },
  { id: 'serif', label: 'Serif', family: 'ui-serif' },
  { id: 'avenir-next', label: 'Avenir Next', family: 'AvenirNext-Regular' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia' },
  { id: 'apple-sd-gothic-neo', label: 'Apple SD Gothic Neo', family: 'AppleSDGothicNeo-Regular' },
] as const;
export type LearningFont = typeof learningFonts[number]['id'];
export function isLearningFont(value: unknown): value is LearningFont {
  return learningFonts.some(font => font.id === value);
}
