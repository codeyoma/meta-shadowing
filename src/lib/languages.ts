export const LANGUAGE_CATALOG = [
  { id: "english", code: "en", koreanLabel: "영어", nativeLabel: "English", countryCode: "GB", flag: "🇬🇧" },
  { id: "japanese", code: "ja", koreanLabel: "일본어", nativeLabel: "日本語", countryCode: "JP", flag: "🇯🇵" },
  { id: "chinese", code: "zh", koreanLabel: "중국어", nativeLabel: "中文", countryCode: "CN", flag: "🇨🇳" },
  { id: "german", code: "de", koreanLabel: "독일어", nativeLabel: "Deutsch", countryCode: "DE", flag: "🇩🇪" },
  { id: "french", code: "fr", koreanLabel: "프랑스어", nativeLabel: "Français", countryCode: "FR", flag: "🇫🇷" },
] as const;

export type Language = (typeof LANGUAGE_CATALOG)[number]["id"];
export type LanguageCode = (typeof LANGUAGE_CATALOG)[number]["code"];
export type LanguageInfo = (typeof LANGUAGE_CATALOG)[number];

const LANGUAGE_INFO = new Map<Language, LanguageInfo>(LANGUAGE_CATALOG.map(info => [info.id, info]));

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_INFO.has(value as Language);
}

export function languageInfo(language: Language): LanguageInfo {
  return LANGUAGE_INFO.get(language)!;
}

export function languageCode(language: Language): LanguageCode {
  return languageInfo(language).code;
}
