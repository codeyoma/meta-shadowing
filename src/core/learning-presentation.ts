import { isFirstWordStage, type PlayableStage } from './catalog';
import type { LearningUnit } from './learning-units';

/** Display-only projection shared by bubble, list, and analysis surfaces. */
export function presentLearningUnits(units: readonly LearningUnit[], stage: PlayableStage, revealedUnit: number | null) {
  return units.map((unit, index) => {
    const masked = isFirstWordStage(stage) && index !== revealedUnit;
    return { text: masked ? unit.firstWordHint : unit.text, translation: unit.translation, masked,
      members: unit.members.map(({ text, translation }) => ({ text, translation })) };
  });
}
