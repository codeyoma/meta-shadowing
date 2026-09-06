"use client";

import { useState } from "react";
import Link from "next/link";
import type { ManagedLesson } from "@/lib/lesson-management";
import { requestLessonPublication } from "@/lib/request-lesson-publication";
import { Brand, Page } from "../../ui";

const statusNames = { draft: "초안", published: "게시 중", unpublished: "게시 해제됨", deleting: "삭제 정리 필요" };

export function LessonManager({ initialLessons, initialError = "" }: { initialLessons: ManagedLesson[]; initialError?: string }) {
  const [lessons, setLessons] = useState(initialLessons);
  const [confirmation, setConfirmation] = useState<ManagedLesson | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [selectedDraftIds, setSelectedDraftIds] = useState<Record<string, string>>({});

  function selectedDraft(lesson: ManagedLesson) {
    return lesson.pendingDrafts.find(draft => draft.id === selectedDraftIds[lesson.id]) ?? lesson.pendingDrafts[0];
  }

  async function reloadLessons() {
    const response = await fetch("/api/admin/lessons", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "목록을 새로고침해 주세요.");
    setLessons(payload.lessons);
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try { await reloadLessons(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "목록을 새로고침해 주세요."); }
    finally { setBusy(false); }
  }
  async function mutate(lesson: ManagedLesson, action: "unpublish" | "delete") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/lessons/${lesson.id}${action === "unpublish" ? "/unpublish" : ""}`, {
        method: action === "unpublish" ? "POST" : "DELETE",
        ...(action === "delete" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          confirmTitle: title, expectedDraftId: lesson.draftId
        }) } : {})
      });
      const payload = await response.json();
      // Always refresh: a failed delete may already have hidden the lesson and removed files.
      await reloadLessons();
      if (!response.ok) throw new Error(payload.error || "작업을 완료하지 못했습니다. 다시 시도해 주세요.");
      setConfirmation(null);
      setMessage(action === "delete" ? "모든 버전의 레슨 데이터와 음성을 영구 삭제했습니다. 복구할 수 없습니다." : "게시를 해제했습니다. 레슨 데이터와 음성은 유지됩니다.");
    } catch (reason) {
      setConfirmation(null);
      setError(reason instanceof Error ? reason.message : "연결을 확인하고 목록을 새로고침해 주세요.");
    } finally { setBusy(false); }
  }

  async function publishUploadedDraft(lesson: ManagedLesson) {
    const pending = selectedDraft(lesson);
    if (!pending) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestLessonPublication(pending.id);
      await reloadLessons();
      setMessage("업로드된 음성을 확인하여 레슨을 게시했습니다. 파일은 재업로드하지 않았습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "게시 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <Page className="admin-page">
    <header className="admin-header"><Brand compact /><Link href="/admin">새 레슨 가져오기</Link></header>
    <section className="admin-workspace" aria-labelledby="management-title">
      <div className="admin-page-title"><p>관리자</p><h1 id="management-title">레슨 관리</h1></div>
      <button className="secondary-button" type="button" disabled={busy} onClick={refresh}>목록 새로고침</button>
      {message ? <p className="management-message" role="status">{message}</p> : null}
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      <ul className="managed-lessons">
        {lessons.map(lesson => <li key={lesson.id}>
          <div className="managed-lesson-heading">
            <h2>{lesson.title}</h2>
            <p>{lesson.language === "english" ? "영어" : "일본어"} · {statusNames[lesson.status]} · {lesson.versionCount}개 버전</p>
          </div>
          {lesson.status === "deleting" ? <p className="admin-form-error">{lesson.cleanupError || "삭제가 중단되었습니다. 레슨은 숨김 상태입니다. 삭제 정리를 다시 시도해 주세요."}</p> : null}
          {lesson.pendingDrafts.length > 1 ? <div className="import-metadata">
            <label htmlFor={`pending-draft-${lesson.id}`}>게시할 초안</label>
            <select id={`pending-draft-${lesson.id}`} disabled={busy} value={selectedDraft(lesson)?.id} onChange={event => setSelectedDraftIds({ ...selectedDraftIds, [lesson.id]: event.target.value })}>
              {lesson.pendingDrafts.map((draft, index) => <option key={draft.id} value={draft.id}>{draft.title} — {index + 1}번 (최신순)</option>)}
            </select>
          </div> : null}
          {selectedDraft(lesson) ? <p>
            {selectedDraft(lesson)!.id !== lesson.draftId ? `대기 중인 새 버전 “${selectedDraft(lesson)!.title}”: ` : ""}
            이미 올린 음성으로 검증과 게시만 진행합니다. 파일을 다시 선택하거나 업로드하지 않습니다.
          </p> : null}
          <div className="management-actions">
            {lesson.pendingDrafts.length ? <button className="primary-button" disabled={busy} onClick={() => publishUploadedDraft(lesson)}>{busy ? "처리 중…" : "업로드된 음성으로 게시"}</button> : null}
            {lesson.status !== "deleting" && lesson.versionCount > 0
              ? <Link className="secondary-button" href={`/admin?replace=${lesson.id}`}>새 버전 가져오기</Link> : null}
            {lesson.status === "published" ? <button className="secondary-button" disabled={busy} onClick={() => mutate(lesson, "unpublish")}>게시 해제</button> : null}
            <button className="secondary-button danger-button" disabled={busy} onClick={() => { setConfirmation(lesson); setTitle(""); }}>
              {lesson.status === "deleting" ? "삭제 정리 다시 시도" : "영구 삭제"}
            </button>
          </div>
          {confirmation?.id === lesson.id ? <form className="delete-confirmation" onSubmit={event => { event.preventDefault(); if (title === confirmation.title) void mutate(confirmation, "delete"); }}>
            <fieldset disabled={busy} aria-label="영구 삭제 확인">
              <legend>영구 삭제 확인</legend>
              <p>“{confirmation.title}”의 모든 버전, 초안, 텍스트와 음성을 영구 삭제합니다. 복구할 수 없습니다.</p>
              <label htmlFor="delete-lesson-title">삭제할 레슨 제목</label>
              <input id="delete-lesson-title" value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" autoFocus />
              <div className="management-actions">
                <button className="secondary-button" type="button" onClick={() => setConfirmation(null)}>취소</button>
                <button className="secondary-button danger-button" type="submit" disabled={title !== confirmation.title}>{busy ? "삭제 중…" : "삭제 확인"}</button>
              </div>
            </fieldset>
          </form> : null}
        </li>)}
      </ul>
      {!lessons.length && !error ? <p>저장된 레슨이 없습니다.</p> : null}
    </section>
  </Page>;
}
