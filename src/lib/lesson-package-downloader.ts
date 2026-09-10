import { validatePackage, type PackageAcquisition } from "./lesson-package";
import { beginPackageInstall, commitPackageInstall, deleteLessonPackage, invalidatePackageAccount, readStagedPackageAudio, reservePackageInstall, stagePackageAudio } from "./lesson-package-store";

export type PackageDownloadProgress = { state: "acquiring" | "downloading" | "ready" | "paused" | "error"; complete: number; total: number; error?: string };
export class PackageAccessError extends Error {}
export function createLessonPackageDownloader(accountId: string, onProgress: (lessonId: string, progress: PackageDownloadProgress) => void = () => {}) {
  const operations = new Map<string, AbortController>();
  let invalid = false;
  return {
    async download(lesson: { id: string; version: string }) {
      if (invalid || operations.has(lesson.id)) return;
      const controller = new AbortController();
      operations.set(lesson.id, controller);
      let complete = 0, total = 0;
      const progress = (state: PackageDownloadProgress["state"], error?: string) => {
        if (!invalid && operations.get(lesson.id) === controller) onProgress(lesson.id, { state, complete, total, error });
      };
      try {
        progress("acquiring");
        const reserved = await reservePackageInstall(accountId, lesson.id);
        const response = await fetch(`/api/lessons/${encodeURIComponent(lesson.id)}/package?version=${encodeURIComponent(lesson.version)}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new PackageAccessError("Package authorization rejected");
        if (!response.ok) throw new Error(response.status === 409 ? "이 레슨은 검증된 새 버전이 필요합니다." : "레슨 자료를 받지 못했습니다. 다시 시도해 주세요.");
        const acquisition: PackageAcquisition = await response.json();
        if (acquisition.accountId !== accountId) throw new PackageAccessError("Package account changed");
        validatePackage(acquisition.manifest);
        if (acquisition.manifest.lesson.id !== lesson.id || acquisition.manifest.lesson.version !== lesson.version) throw new Error("Package version changed");
        controller.signal.throwIfAborted();
        const ticket = await beginPackageInstall(reserved, acquisition);
        total = acquisition.manifest.audio.length;
        progress("downloading");
        // Persistent storage is a request, never a prerequisite or a permanence guarantee.
        void navigator.storage?.persist?.().catch(() => false);
        let next = 0;
        const worker = async () => {
          while (next < total) {
            const index = next++;
            controller.signal.throwIfAborted();
            if (!(await readStagedPackageAudio(ticket, index))) {
              const descriptor = acquisition.manifest.audio[index];
              const audio = await fetch(`/api/lessons/${encodeURIComponent(lesson.id)}/audio/${descriptor.phraseNumber}?version=${encodeURIComponent(lesson.version)}`, {
                credentials: "same-origin", cache: "no-store", signal: controller.signal,
              });
              if (audio.status === 401 || audio.status === 403) throw new PackageAccessError("Package authorization rejected");
              if (!audio.ok) throw new Error("오디오를 받지 못했습니다. 이어받기를 눌러 주세요.");
              // Bound response bytes even if a server/proxy sends more than its header promises.
              if (audio.headers.get("content-type")?.split(";")[0].trim() !== descriptor.mimeType || !audio.body) throw new Error("오디오 형식이 일치하지 않습니다.");
              const reader = audio.body.getReader();
              const chunks: ArrayBuffer[] = [];
              let size = 0;
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  size += value.byteLength;
                  if (size > descriptor.size) throw new Error("오디오 크기가 일치하지 않습니다.");
                  chunks.push(value.slice().buffer);
                }
              } finally { await reader.cancel().catch(() => {}); }
              controller.signal.throwIfAborted();
              await stagePackageAudio(ticket, index, new Blob(chunks, { type: descriptor.mimeType }));
            }
            complete++;
            progress("downloading");
          }
        };
        // A failed worker cancels siblings before allowing the next attempt.
        const workers = Array.from({ length: Math.min(3, total) }, () => worker().catch(error => { controller.abort(error); throw error; }));
        const outcomes = await Promise.allSettled(workers);
        const failed = outcomes.find(outcome => outcome.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        controller.signal.throwIfAborted();
        await commitPackageInstall(ticket, controller.signal);
        controller.signal.throwIfAborted();
        progress("ready");
      } catch (error) {
        if (error instanceof PackageAccessError) {
          invalid = true;
          for (const operation of operations.values()) operation.abort();
          await invalidatePackageAccount(accountId, true);
          onProgress(lesson.id, { state: "error", complete, total, error: "계정 인증이 필요합니다. 다시 로그인해 주세요." });
        } else {
          const paused = error instanceof DOMException && error.name === "AbortError";
          progress(paused ? "paused" : "error", paused ? undefined : error instanceof Error ? error.message : "기기 저장 공간을 확인하고 다시 시도해 주세요.");
        }
        throw error;
      } finally { if (operations.get(lesson.id) === controller) operations.delete(lesson.id); }
    },
    pause(lessonId: string) { operations.get(lessonId)?.abort(); },
    async delete(lessonId: string) { operations.get(lessonId)?.abort(); await deleteLessonPackage(lessonId); },
    async invalidate(revokeGrants = false) {
      invalid = true;
      for (const operation of operations.values()) operation.abort();
      await invalidatePackageAccount(accountId, revokeGrants);
    },
    dispose() { invalid = true; for (const operation of operations.values()) operation.abort(); },
  };
}
