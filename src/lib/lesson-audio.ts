export const LESSON_AUDIO_BUCKET = "lesson-audio";

export function getLessonAudioFolder(adminId: string, draftId: string) {
  return `${adminId}/${draftId}`;
}

export function getLessonAudioPath(adminId: string, draftId: string, canonicalName: string) {
  return `${getLessonAudioFolder(adminId, draftId)}/${canonicalName}`;
}
