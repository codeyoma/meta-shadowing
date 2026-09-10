import "server-only";

import { getSupportedAudioFormat } from "./audio-format";
import { decodeLessonDraftEntries } from "./lesson-entry-decoder";
import { LESSON_AUDIO_BUCKET, getLessonAudioFolder } from "./lesson-audio";
import { createSecretSupabaseClient } from "./supabase/secret";

/** Audio publication metadata only. This is not a complete or installed package. */
export type PublishedAudioDescriptor = {
  schemaVersion: 1;
  lessonId: string;
  publishedVersion: string;
  audio: { assetId: string; phraseNumber: number; mimeType: string; size: number; sha256: string }[];
};

export class UnverifiedPublicationError extends Error {}

export async function getPublishedAudioDescriptor(lessonId: string, version: string): Promise<PublishedAudioDescriptor | null> {
  const client = createSecretSupabaseClient(AbortSignal.timeout(15_000));
  if (!client) throw new Error("Publication storage unavailable");
  const { data: row, error } = await client.from("lesson_drafts")
    .select("id, lesson_id, created_by, published_at, phrase_count, parsed_entries, audio_manifest")
    .eq("lesson_id", lessonId).eq("publication_status", "published").eq("published_at", version).maybeSingle();
  if (error) throw new Error("Publication read failed");
  if (!row) return null;
  const entries = decodeLessonDraftEntries(row.parsed_entries);
  const phrases = entries?.filter(entry => entry.kind === "phrase");
  if (!phrases?.length || phrases.length !== row.phrase_count || !Array.isArray(row.audio_manifest)
    || row.audio_manifest.length !== phrases.length) throw new UnverifiedPublicationError();
  const folder = `${getLessonAudioFolder(row.created_by, row.id)}/verified`;
  const audio = row.audio_manifest.map((value: unknown, index: number) => {
    if (!value || typeof value !== "object") throw new UnverifiedPublicationError();
    const item = value as Record<string, unknown>;
    const format = typeof item.canonicalName === "string" && getSupportedAudioFormat(item.canonicalName);
    if (!format || item.canonicalName !== `${String(index + 1).padStart(3, "0")}.${format.extension}`
      || item.phraseNumber !== phrases[index].phraseNumber || item.sourceLine !== phrases[index].sourceLine
      || item.contentType !== format.contentType || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !Number.isSafeInteger(item.size) || (item.size as number) < 1 || (item.size as number) > 4 * 1024 * 1024
      || item.path !== `${folder}/${item.sha256}.${format.extension}`) throw new UnverifiedPublicationError();
    return { assetId: `${item.canonicalName}:${item.sha256}`, phraseNumber: item.phraseNumber as number,
      mimeType: format.contentType, size: item.size as number, sha256: item.sha256, fileName: `${item.sha256}.${format.extension}` };
  });
  // Failed attempts can leave more than one metadata page. Keep only required
  // names in memory, stop when all are found, and share the overall deadline.
  // Installation will hash downloaded bytes against the publication digest.
  const needed = new Map(audio.map(item => [item.fileName, item]));
  for (let offset = 0; needed.size; offset += 1000) {
    const stored = await client.storage.from(LESSON_AUDIO_BUCKET).list(folder, {
      limit: 1000, offset, sortBy: { column: "name", order: "asc" },
    });
    if (stored.error) throw new Error("Verified audio metadata unavailable");
    for (const file of stored.data) {
      const item = needed.get(file.name);
      if (!item) continue;
      if (!file.id || Number(file.metadata?.size) !== item.size || file.metadata?.mimetype !== item.mimeType) {
        throw new Error("Verified audio changed");
      }
      needed.delete(file.name);
    }
    if (needed.size && stored.data.length < 1000) throw new Error("Verified audio missing");
  }
  const current = await client.from("lesson_drafts").select("id")
    .eq("id", row.id).eq("publication_status", "published").eq("published_at", version).maybeSingle();
  if (current.error) throw new Error("Publication check failed");
  if (!current.data) return null;
  return { schemaVersion: 1, lessonId, publishedVersion: row.published_at,
    audio: audio.map(({ fileName: _fileName, ...item }) => item) };
}
