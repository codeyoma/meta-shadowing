import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { testRecording } from "./audio";

/** Explicit fictional publication fixture with matching durable bytes and metadata. */
export function createVerifiedTestAudio(service: SupabaseClient, accountId: string, draftId: string, count: number) {
  const sha256 = createHash("sha256").update(testRecording).digest("hex");
  const path = `${accountId}/${draftId}/verified/${sha256}.webm`;
  return {
    manifest: Array.from({ length: count }, (_, index) => ({ phraseNumber: index + 1, sourceLine: index + 1,
      canonicalName: `${String(index + 1).padStart(3, "0")}.webm`, path, contentType: "audio/webm", size: testRecording.length, sha256 })),
    upload: async () => {
      // The Storage deletion fence requires the owned draft row to exist first.
      const stored = await service.storage.from("lesson-audio").upload(path, testRecording, { contentType: "audio/webm" });
      if (stored.error) throw new Error("Verified audio fixture upload failed");
    },
    cleanup: async () => { await service.storage.from("lesson-audio").remove([path]); },
  };
}
