export async function requestLessonPublication(draftId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/drafts/${encodeURIComponent(draftId)}/publish`, { method: "POST" });
  } catch {
    throw new Error("서버 연결이 끊겼습니다. 업로드된 음성은 유지됩니다. 레슨 관리에서 게시 상태를 확인한 뒤 게시만 다시 시도해 주세요.");
  }
  if (response.status === 504 || response.status === 408) {
    throw new Error("게시 검증 시간이 초과되었습니다. 업로드된 음성은 유지됩니다. 잠시 후 게시만 다시 시도해 주세요.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("관리자 인증을 확인해 주세요. 다시 로그인한 뒤 레슨 관리에서 게시만 다시 시도할 수 있습니다.");
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { /* Platform errors may be plain text or HTML. */ }
  const object = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (!response.ok) {
    throw new Error(typeof object?.message === "string" ? object.message :
      `게시 요청을 처리하지 못했습니다 (HTTP ${response.status}). 업로드된 음성은 유지됩니다. 게시만 다시 시도해 주세요.`);
  }
  if (typeof object?.lessonId !== "string" || !object.lessonId.trim()) {
    throw new Error("게시 응답을 확인하지 못했습니다. 레슨 관리에서 게시 상태를 확인한 뒤 게시만 다시 시도해 주세요.");
  }
}
