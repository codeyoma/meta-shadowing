import { levelNames } from "./lessons";

export const learningInstructions = [
  "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.",
  "자막을 보며 따라 말하고, 눈을 감고 한 번 더 말하세요.",
  "첫 단어를 힌트로 듣고, 자막 없이 두 번 말하세요.",
  "여러 문장을 따라 말하고, 눈을 감고 한 번 더 말하세요.",
  "각 문장의 첫 단어를 보고, 자막 없이 두 번 말하세요.",
  "목표어를 따라 말하고, 이어지는 한국어 뜻을 확인하세요.",
  "한국어를 보고 목표어로 말한 뒤, 정답을 확인하세요.",
  "한국어만 보고, 목표어 문장을 빠르게 말하세요."
];

// Stages are two consecutive passes of each of the eight playback methods.
// Keep level ids stable for existing URLs, settings and audio engines.
export const learningStages = levelNames.flatMap((name, index) => [
  { stage: index * 2 + 1, level: index + 1, name },
  { stage: index * 2 + 2, level: index + 1, name }
]);

export function isStageForLevel(stage: unknown, level: number): stage is number {
  return typeof stage === "number" && Number.isInteger(stage)
    && stage >= 1 && stage <= learningStages.length && Math.ceil(stage / 2) === level;
}

export function stageForLevel(level: number, stage?: unknown): number {
  return isStageForLevel(stage, level) ? stage : level * 2 - 1;
}
