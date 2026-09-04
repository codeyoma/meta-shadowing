export const AUDIO_FORMATS = {
  mp3: {
    label: "MP3",
    contentType: "audio/mpeg",
    acceptedTypes: ["audio/mpeg", "audio/mp3"]
  },
  m4a: {
    label: "M4A",
    contentType: "audio/mp4",
    acceptedTypes: ["audio/mp4", "audio/m4a", "audio/x-m4a"]
  },
  webm: {
    label: "WebM",
    contentType: "audio/webm",
    acceptedTypes: ["audio/webm"]
  }
} as const;

export type AudioExtension = keyof typeof AUDIO_FORMATS;
export type AudioContentType = (typeof AUDIO_FORMATS)[AudioExtension]["contentType"];

export function getFileExtension(fileName: string) {
  return fileName.split(".").at(-1)?.toLowerCase();
}

export function getSupportedAudioFormat(fileName: string) {
  const extension = getFileExtension(fileName);
  if (!extension || !(extension in AUDIO_FORMATS)) return null;
  const supportedExtension = extension as AudioExtension;
  return { extension: supportedExtension, ...AUDIO_FORMATS[supportedExtension] };
}

export function matchesDeclaredAudioType(fileName: string, declaredType: string) {
  const format = getSupportedAudioFormat(fileName);
  if (!format) return false;
  const mediaType = declaredType.split(";", 1)[0].trim().toLowerCase();
  return (format.acceptedTypes as readonly string[]).includes(mediaType);
}
