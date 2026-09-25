import LearningFonts from './src/LearningFontsModule';

/** A missing/older native build safely offers System only. No font downloads. */
export function availableLearningFonts(): readonly string[] {
  try { return LearningFonts?.availableFonts() ?? ['system']; }
  catch { return ['system']; }
}
