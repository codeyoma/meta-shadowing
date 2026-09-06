import type { AudioPackageIssue, AudioPackageItem } from "./audio-package";
import { hasSupportedAudioSignature } from "./audio-signature";

export class AudioContentValidationError extends Error {
  constructor(readonly code: "audio-validation-timeout" | "audio-read-failed") {
    super(code === "audio-validation-timeout"
      ? "게시 검증 시간이 초과되었습니다. 업로드된 음성은 유지됩니다. 게시만 다시 시도해 주세요."
      : "업로드된 음성을 확인하지 못했습니다. 잠시 후 게시만 다시 시도해 주세요.");
  }
}

export async function validateAudioContent(
  items: AudioPackageItem[],
  readSignature: (item: AudioPackageItem, signal: AbortSignal) => Promise<Uint8Array>
): Promise<AudioPackageIssue[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Audio validation timed out", "TimeoutError")), 120000);
  const issues: (AudioPackageIssue | undefined)[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    try {
      while (nextIndex < items.length) {
        controller.signal.throwIfAborted();
        const index = nextIndex++;
        const item = items[index];
        const signature = await readSignature(item, controller.signal);
        controller.signal.throwIfAborted();
        if (!hasSupportedAudioSignature(item.canonicalName, signature)) issues[index] = {
          code: "invalid-audio-content", phraseNumber: item.phraseNumber, fileName: item.originalName,
          message: `${item.originalName}의 실제 오디오 형식을 확인할 수 없습니다. 원본 파일을 다시 업로드해 주세요.`
        };
      }
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      const failure = reason instanceof AudioContentValidationError ? reason : new AudioContentValidationError(
        reason instanceof DOMException && reason.name === "TimeoutError" ? "audio-validation-timeout" : "audio-read-failed"
      );
      controller.abort(failure);
      throw failure;
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
    return issues.filter((issue): issue is AudioPackageIssue => issue !== undefined);
  } finally {
    clearTimeout(timeout);
  }
}
