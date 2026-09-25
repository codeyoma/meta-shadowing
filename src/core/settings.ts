import { isLearningFont, type LearningFont } from './learning-fonts';

export type Settings = { mode: 'manual'; rate: number; speechView?: 'bubble' | 'list'; groupSize?: 2 | 3 | 4;
  crazyWpm?: [number, number, number, number]; originalTextSize?: number; translationTextSize?: number;
  originalTextFont?: LearningFont; translationTextFont?: LearningFont };
export type LearningTypography = Pick<Settings, 'originalTextSize' | 'translationTextSize' | 'originalTextFont' | 'translationTextFont'>;
export const defaultTextSizes = { originalTextSize: 20, translationTextSize: 18 } as const;
export const defaultTextFonts = { originalTextFont: 'system', translationTextFont: 'system' } as const;
export function freshSettings(): Settings { return { mode: 'manual', rate: 1, ...defaultTextSizes, ...defaultTextFonts }; }
export function isLearningTextSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 12 && value <= 48;
}
export const defaultCrazyWpm: [number, number, number, number] = [150, 200, 250, 300];
export function isSpeakingWpm(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999;
}
export function isPlaybackRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 3;
}
export function decodeSettings(json: string | null): Settings {
  if (json === null) return { mode: 'manual', rate: 1 };
  const value = JSON.parse(json);
  if (!value || !['manual', 'auto'].includes(value.mode) || !isPlaybackRate(value.rate)) throw Error('Invalid settings.');
  const result: Settings = { mode: 'manual', rate: value.rate };
  if ('speechView' in value) {
    if (!['bubble', 'list'].includes(value.speechView)) throw Error('Invalid speech view.');
    result.speechView = value.speechView;
  }
  if ('groupSize' in value) {
    if (![2, 3, 4].includes(value.groupSize)) throw Error('Invalid group size.');
    result.groupSize = value.groupSize;
  }
  if ('crazyWpm' in value) {
    if (!Array.isArray(value.crazyWpm) || value.crazyWpm.length !== 4 || !value.crazyWpm.every(isSpeakingWpm)) throw Error('Invalid speaking speed.');
    result.crazyWpm = [...value.crazyWpm] as Settings['crazyWpm'];
  }
  for (const key of ['originalTextSize', 'translationTextSize'] as const) {
    if (key in value) {
      if (!isLearningTextSize(value[key])) throw Error('Invalid learning text size.');
      result[key] = value[key];
    }
  }
  for (const key of ['originalTextFont', 'translationTextFont'] as const) {
    if (key in value) {
      if (!isLearningFont(value[key])) throw Error('Invalid learning font.');
      result[key] = value[key];
    }
  }
  return result;
}
