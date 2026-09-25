import { availableLearningFonts } from '../../modules/learning-fonts';
import { learningFonts, type LearningFont } from '@/core/learning-fonts';

// Built-in availability is stable for this process. It is not a saved preference.
const supported = new Set(availableLearningFonts());
supported.add('system');
export const availableFontChoices = learningFonts.filter(font => supported.has(font.id));

/** Undefined preserves legacy styling; an unavailable saved choice falls back, not gets erased. */
export function learningFontFamily(choice?: LearningFont): string | undefined {
  if (choice === undefined) return undefined;
  return supported.has(choice) ? learningFonts.find(font => font.id === choice)?.family ?? 'system-ui' : 'system-ui';
}
