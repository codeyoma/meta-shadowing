"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { ManagedLesson } from "@/lib/lesson-management";
import { requestLessonPublication } from "@/lib/request-lesson-publication";
import { Brand, Page } from "../../ui";
import { SyntaxAnalysisStatus } from "../syntax-analysis-status";

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

  return <Page className="px-4 pb-4 sm:px-8">
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 py-6"><Brand compact /><Button asChild variant="outline"><Link href="/admin">새 레슨 가져오기</Link></Button></header>
    <ScrollArea className="mx-auto w-full max-w-5xl flex-1" viewportProps={{ role: "region", "aria-label": "레슨 관리 목록" }}>
    <section className="flex min-w-0 flex-col gap-8 px-2 pt-6 pb-4" aria-labelledby="management-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="management-title" className="font-heading text-3xl font-bold text-display">레슨 관리</h1>
        <Button variant="outline" type="button" disabled={busy} onClick={refresh}>{busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}목록 새로고침</Button>
      </div>
      {message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <ul className="flex min-w-0 flex-col gap-6">
        {lessons.map(lesson => <li key={lesson.id}>
          <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="min-w-0 break-words">{lesson.title}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>{lesson.language === "english" ? "영어" : "일본어"}</span>
              <Badge variant={lesson.status === "deleting" ? "destructive" : lesson.status === "published" ? "secondary" : "outline"}>{statusNames[lesson.status]}</Badge>
              <span>{lesson.versionCount}개 버전</span>
            </CardDescription>
          </CardHeader>
          {lesson.status === "deleting" || selectedDraft(lesson) ? <CardContent className="flex flex-col gap-4">
          {lesson.status === "deleting" ? <Alert variant="destructive"><AlertDescription>{lesson.cleanupError || "삭제가 중단되었습니다. 레슨은 숨김 상태입니다. 삭제 정리를 다시 시도해 주세요."}</AlertDescription></Alert> : null}
          {lesson.pendingDrafts.length > 1 ? <FieldGroup>
            <Field data-disabled={busy}>
            <FieldLabel htmlFor={`pending-draft-${lesson.id}`}>게시할 초안</FieldLabel>
            <NativeSelect id={`pending-draft-${lesson.id}`} disabled={busy} value={selectedDraft(lesson)?.id} onChange={event => setSelectedDraftIds({ ...selectedDraftIds, [lesson.id]: event.target.value })}>
              {lesson.pendingDrafts.map((draft, index) => <NativeSelectOption key={draft.id} value={draft.id}>{draft.title} — {index + 1}번 (최신순)</NativeSelectOption>)}
            </NativeSelect>
            </Field>
          </FieldGroup> : null}
          {selectedDraft(lesson) ? <p className="text-muted-foreground">
            {selectedDraft(lesson)!.id !== lesson.draftId ? `대기 중인 새 버전 “${selectedDraft(lesson)!.title}”: ` : ""}
            이미 올린 음성으로 검증과 게시만 진행합니다. 파일을 다시 선택하거나 업로드하지 않습니다.
          </p> : null}
          </CardContent> : null}
          <CardFooter className="flex-col items-stretch gap-6">
          {lesson.status !== "deleting" ? <SyntaxAnalysisStatus key={selectedDraft(lesson)?.id ?? lesson.draftId} draftId={selectedDraft(lesson)?.id ?? lesson.draftId} /> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {lesson.pendingDrafts.length ? <Button disabled={busy} onClick={() => publishUploadedDraft(lesson)}>{busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}{busy ? "처리 중…" : "업로드된 음성으로 게시"}</Button> : null}
            {lesson.status !== "deleting" && lesson.versionCount > 0
              ? <Button asChild variant="outline"><Link href={`/admin?replace=${lesson.id}`}>새 버전 가져오기</Link></Button> : null}
            {lesson.status === "published" ? <Button variant="outline" disabled={busy} onClick={() => mutate(lesson, "unpublish")}>게시 해제</Button> : null}
            <Button variant="destructive" disabled={busy} onClick={() => { setConfirmation(lesson); setTitle(""); }}>
              {lesson.status === "deleting" ? "삭제 정리 다시 시도" : "영구 삭제"}
            </Button>
          </div>
          {confirmation?.id === lesson.id ? <form onSubmit={event => { event.preventDefault(); if (title === confirmation.title) void mutate(confirmation, "delete"); }}>
            <FieldSet disabled={busy} aria-label="영구 삭제 확인">
              <FieldLegend>영구 삭제 확인</FieldLegend>
              <FieldDescription>“{confirmation.title}”의 모든 버전, 초안, 텍스트와 음성을 영구 삭제합니다. 복구할 수 없습니다.</FieldDescription>
              <FieldGroup>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="delete-lesson-title">삭제할 레슨 제목</FieldLabel>
                <Input id="delete-lesson-title" value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" autoFocus />
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => setConfirmation(null)}>취소</Button>
                <Button variant="destructive" type="submit" disabled={title !== confirmation.title}>{busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}{busy ? "삭제 중…" : "삭제 확인"}</Button>
              </div>
              </FieldGroup>
            </FieldSet>
          </form> : null}
          </CardFooter>
          </Card>
        </li>)}
      </ul>
      {!lessons.length && !error ? <Empty><EmptyHeader><EmptyTitle>저장된 레슨이 없습니다.</EmptyTitle></EmptyHeader></Empty> : null}
    </section>
    </ScrollArea>
  </Page>;
}
