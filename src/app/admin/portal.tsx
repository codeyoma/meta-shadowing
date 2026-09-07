"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SyntaxAnalysisStatus } from "./syntax-analysis-status";
import { FileTextIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminIdentity } from "@/lib/admin-auth";
import type { ManagedLesson } from "@/lib/lesson-management";
import { mapAudioPackage, type AudioPackageResult } from "@/lib/audio-package";
import { hasSupportedAudioSignature } from "@/lib/audio-signature";
import { requestLessonPublication } from "@/lib/request-lesson-publication";
import {
  LESSON_AUDIO_BUCKET,
  getLessonAudioFolder,
  getLessonAudioPath
} from "@/lib/lesson-audio";
import type { LessonDraftParseResult } from "@/lib/lesson-draft-parser";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Brand, Page } from "../ui";
import styles from "./admin.module.css";

type ImportResponse = {
  draftId?: string;
  error?: string;
  result?: LessonDraftParseResult;
};

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "token">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) throw new Error("request failed");
      setStep("token");
    } catch {
      setError("등록된 관리자 이메일인지 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: form.get("token") })
      });
      if (!response.ok) throw new Error("verification failed");
      window.location.reload();
    } catch {
      setError("인증 코드가 올바르지 않거나 만료되었습니다.");
      setBusy(false);
    }
  }

  return (
    <Page className="px-4 py-8 sm:px-8">
      <ScrollArea className="mx-auto w-full max-w-md flex-1" viewportProps={{ role: "region", "aria-label": "관리자 로그인" }}>
      <section className="mx-auto flex w-full max-w-md flex-col gap-12">
        <Brand />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="font-heading text-3xl font-bold text-display">관리자 로그인</h1>
            <p className="text-muted-foreground">등록된 관리자 이메일로 일회용 코드를 받으세요.</p>
          </div>
          {step === "email" ? (
            <form onSubmit={requestCode}>
              <FieldGroup>
              <Field data-invalid={!!error}>
              <FieldLabel htmlFor="admin-email">이메일</FieldLabel>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                aria-invalid={!!error}
                aria-describedby={error ? "admin-auth-error" : undefined}
                required
              />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
                로그인 코드 받기
              </Button>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <FieldGroup>
              <Field data-invalid={!!error}>
              <FieldDescription>{email}</FieldDescription>
              <FieldLabel htmlFor="admin-token">인증 코드</FieldLabel>
              <Input
                id="admin-token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                aria-invalid={!!error}
                aria-describedby={error ? "admin-auth-error" : undefined}
                required
              />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
                확인하고 계속
              </Button>
              </FieldGroup>
            </form>
          )}
          {error ? <Alert variant="destructive" id="admin-auth-error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
      </section>
      </ScrollArea>
    </Page>
  );
}

function DraftPreview({
  result,
  audioResult,
  audioSelected
}: {
  result: LessonDraftParseResult;
  audioResult: AudioPackageResult | null;
  audioSelected: boolean;
}) {
  const summary = `${result.summary.phrases}개 프레이즈 · ${result.summary.chapters}개 챕터 · ${result.summary.sections}개 구간`;
  const audioByPhrase = new Map(audioResult?.items.map((item) => [item.phraseNumber, item]));

  return (
    <section className="flex min-w-0 flex-col gap-6" aria-labelledby="preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="preview-title" className="font-heading text-2xl font-bold">검증 미리보기</h2>
        <Badge variant={result.publishReady ? "secondary" : "destructive"}>
          {result.publishReady ? "검증 완료" : "게시 준비 불가"}
        </Badge>
      </div>
      <Alert role="note" variant={result.publishReady ? "default" : "destructive"}>
        <AlertDescription>{summary} · {result.issues.length ? `${result.issues.length}개 오류` : "오류 없음"}</AlertDescription>
      </Alert>
      {result.issues.length ? (
        <Alert variant="destructive">
          <AlertDescription><ul className="flex list-disc flex-col gap-2 pl-4">
            {result.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.sourceLine}-${index}`}>{issue.message}</li>
            ))}
          </ul></AlertDescription>
        </Alert>
      ) : null}
      <section className="flex flex-col gap-4" aria-labelledby="audio-package-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="audio-package-title" className="text-lg font-bold">문장별 음성</h3>
          {audioResult ? (
            <Badge variant={audioResult.publishReady ? "secondary" : "destructive"}>
              {audioResult.items.length} / {result.summary.phrases} 연결 · {audioResult.publishReady ? "게시 가능" : "확인 필요"}
            </Badge>
          ) : (
            <Badge variant="outline">파일 선택 필요</Badge>
          )}
        </div>
        {!audioSelected ? <p className="text-muted-foreground">MP3, M4A, WebM 파일을 001부터 프레이즈 순서대로 선택해 주세요. 여러 줄인 프레이즈에도 음성은 한 개입니다.</p> : null}
        {audioResult?.issues.length ? (
          <Alert variant="destructive">
            <AlertDescription><ul className="flex list-disc flex-col gap-2 pl-4">
              {audioResult.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.fileName ?? issue.phraseNumber}-${index}`}>{issue.message}</li>
              ))}
            </ul></AlertDescription>
          </Alert>
        ) : null}
      </section>
        <Table className={styles.previewTable} role="table">
          <TableHeader role="rowgroup">
            <TableRow role="row">
              <TableHead scope="col" role="columnheader" className="w-16">순서</TableHead>
              <TableHead scope="col" role="columnheader" className="w-24">구분</TableHead>
              <TableHead scope="col" role="columnheader">목표어</TableHead>
              <TableHead scope="col" role="columnheader">한국어</TableHead>
              <TableHead scope="col" role="columnheader" className="w-32">음성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody role="rowgroup">
            {result.entries.map((entry, index) => {
              if (entry.kind === "section") {
                return (
                  <TableRow role="row" key={`section-${entry.sourceLine}-${index}`}>
                    <TableCell role="cell" data-label="순서">—</TableCell>
                    <TableCell role="cell" colSpan={4}><Badge variant="outline">이름 없는 구간</Badge></TableCell>
                  </TableRow>
                );
              }
              return (
                <TableRow role="row" key={`${entry.kind}-${entry.sourceLine}-${index}`}>
                  <TableCell role="cell" data-label="순서">{entry.kind === "phrase" ? entry.phraseNumber : "—"}</TableCell>
                  <TableCell role="cell" data-label="구분">{entry.kind === "chapter" ? <Badge variant="secondary">챕터</Badge> : "프레이즈"}</TableCell>
                  <TableCell role="cell" data-label="목표어">{entry.target || "(비어 있음)"}</TableCell>
                  <TableCell role="cell" data-label="한국어">{entry.korean || (entry.kind === "chapter" ? "—" : "(비어 있음)")}</TableCell>
                  <TableCell role="cell" data-label="음성">
                    {entry.kind === "phrase" ? audioByPhrase.get(entry.phraseNumber)?.originalName ?? "미연결" : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
    </section>
  );
}

function AdminImport({ admin, replacement }: { admin: AdminIdentity; replacement?: ManagedLesson }) {
  const formRef = useRef<HTMLFormElement>(null);
  const importRevisionRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<LessonDraftParseResult | null>(null);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [busyAction, setBusyAction] = useState<"validate" | "save" | "publish" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [audioUploaded, setAudioUploaded] = useState(false);
  const audioResult = useMemo(
    () => (result && audioFiles.length ? mapAudioPackage(result.entries, audioFiles) : null),
    [audioFiles, result]
  );

  useEffect(() => setHydrated(true), []);

  function clearImportResult() {
    setAudioUploaded(false);
    importRevisionRef.current += 1;
    setResult(null);
    setSaved(false);
    setDraftId(null);
    setPublished(false);
    setUploadProgress("");
    setError("");
  }

  function clearSavedDraft() {
    setAudioUploaded(false);
    importRevisionRef.current += 1;
    setSaved(false);
    setDraftId(null);
    setPublished(false);
    setUploadProgress("");
    setError("");
  }

  async function submitImport(path: string, action: "validate" | "save") {
    if (!formRef.current) return;
    if (!formRef.current.reportValidity()) return;
    const revision = importRevisionRef.current;
    setBusyAction(action);
    setError("");
    setSaved(false);
    setPublished(false);
    setUploadProgress("");
    setAudioUploaded(false);
    try {
      const response = await fetch(path, { method: "POST", body: new FormData(formRef.current) });
      const payload = (await response.json()) as ImportResponse;
      if (revision !== importRevisionRef.current) return;
      if (!response.ok || !payload.result) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      setResult(payload.result);
      if (action === "save" && payload.draftId) {
        setDraftId(payload.draftId);
        setSaved(true);
      } else {
        setDraftId(null);
      }
    } catch (reason) {
      if (revision !== importRevisionRef.current) return;
      setError(reason instanceof Error ? reason.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  }

  function selectAudioFiles(files: FileList | null) {
    setAudioUploaded(false);
    setAudioFiles(Array.from(files ?? []));
    setPublished(false);
    setUploadProgress("");
    setError("");
  }

  async function publishLesson() {
    if (!draftId || !result?.publishReady || !audioResult?.publishReady) return;
    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setError("Supabase 공개 설정이 없어 음성을 업로드할 수 없습니다.");
      return;
    }

    setBusyAction("publish");
    setError("");
    setPublished(false);
    try {
      if (!audioUploaded) {
        const folder = getLessonAudioFolder(admin.id, draftId);
        const desiredNames = new Set(audioResult.items.map((item) => item.canonicalName));
        const { data: existingFiles, error: listError } = await supabase.storage
          .from(LESSON_AUDIO_BUCKET)
          .list(folder, { limit: 1000 });
        if (listError) throw new Error(`기존 음성을 확인하지 못했습니다: ${listError.message}`);

        for (const [index, item] of audioResult.items.entries()) {
          const file = audioFiles.find(
            (candidate) => candidate.name === item.originalName && candidate.size === item.size
          );
          if (!file) throw new Error(`${item.originalName} 파일을 다시 선택해 주세요.`);
          const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
          if (!hasSupportedAudioSignature(item.canonicalName, signature)) {
            throw new Error(`${item.originalName}의 실제 오디오 형식을 확인할 수 없습니다. 원본 파일을 다시 선택해 주세요.`);
          }
          setUploadProgress(`${index + 1} / ${audioResult.items.length} 업로드 중`);
          const { error: uploadError } = await supabase.storage
            .from(LESSON_AUDIO_BUCKET)
            .upload(getLessonAudioPath(admin.id, draftId, item.canonicalName), file, {
              cacheControl: "3600",
              contentType: item.contentType,
              upsert: true
            });
          if (uploadError) throw new Error(`${item.originalName} 업로드 실패: ${uploadError.message}`);
        }

        const stalePaths = (existingFiles ?? [])
          .filter((file: { name: string }) => !desiredNames.has(file.name))
          .map((file: { name: string }) => getLessonAudioPath(admin.id, draftId, file.name));
        if (stalePaths.length) {
          const { error: removeError } = await supabase.storage
            .from(LESSON_AUDIO_BUCKET)
            .remove(stalePaths);
          if (removeError) throw new Error(`이전 음성을 정리하지 못했습니다: ${removeError.message}`);
        }
        setAudioUploaded(true);
      }

      setUploadProgress("게시 확인 중");
      await requestLessonPublication(draftId);
      setPublished(true);
      setUploadProgress("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "레슨을 게시하지 못했습니다.");
      setUploadProgress("");
    } finally {
      setBusyAction(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <Page className="px-4 pb-4 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <Brand compact />
          <Badge variant="outline">관리자</Badge>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="ghost" asChild><Link href="/admin/lessons">레슨 관리</Link></Button>
          <Button variant="ghost" asChild><Link href="/admin/settings">전역 학습 기본값</Link></Button>
          <span className="max-w-full break-all text-sm text-muted-foreground">{admin.email}</span>
          <Button variant="outline" type="button" onClick={logout}>로그아웃</Button>
        </div>
      </header>
      <ScrollArea className="mx-auto w-full max-w-5xl flex-1" viewportProps={{ role: "region", "aria-label": "레슨 가져오기" }}>
      <div className="flex min-w-0 flex-col gap-8 px-2 pt-6 pb-4">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-bold text-display">{replacement ? "레슨 새 버전 가져오기" : "새 레슨 가져오기"}</h1>
          {replacement ? <Alert role="note"><AlertDescription>새 파일을 검증하고 게시하면 “{replacement.title}”을 교체합니다. 그전까지 현재 레슨은 유지됩니다.</AlertDescription></Alert> : null}
        </div>
        <form
          ref={formRef}
          className="flex flex-col gap-8"
          data-admin-ready={hydrated ? "true" : "false"}
          onSubmit={(event) => event.preventDefault()}
        >
          {replacement ? <Input type="hidden" name="replacementFor" value={replacement.id} /> : null}
          <FieldGroup className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)]">
            <Field data-disabled={busyAction === "publish"}>
            <FieldLabel htmlFor="lesson-title">레슨 제목</FieldLabel>
            <Input id="lesson-title" name="title" defaultValue={replacement?.title} maxLength={120} required disabled={busyAction === "publish"} onChange={clearSavedDraft} />
            </Field>
            <Field data-disabled={!!replacement || busyAction === "publish"}>
            <FieldLabel htmlFor="lesson-language">언어</FieldLabel>
            {replacement ? <Input type="hidden" name="language" value={replacement.language} /> : null}
            <NativeSelect id="lesson-language" name="language" defaultValue={replacement?.language ?? "english"} disabled={!!replacement || busyAction === "publish"} onChange={clearSavedDraft}>
              <NativeSelectOption value="english">English 영어</NativeSelectOption>
              <NativeSelectOption value="japanese">日本語 일본어</NativeSelectOption>
            </NativeSelect>
            </Field>
          </FieldGroup>
          <FieldGroup className="md:grid md:grid-cols-2">
            <Field data-disabled={busyAction === "publish"}>
              <FieldLabel htmlFor="script-file"><FileTextIcon aria-hidden="true" /> 통합 스크립트</FieldLabel>
              <Input
                id="script-file"
                disabled={busyAction === "publish"}
                name="scriptFile"
                type="file"
                accept=".txt,text/plain"
                aria-describedby="script-format-help"
                required
                onChange={clearImportResult}
              />
              <FieldDescription id="script-format-help">TXT 한 파일에 목표어 묶음 → 한국어 묶음 순서로 넣어 주세요. 연속된 여러 줄도 한 프레이즈이며, 빈 줄은 무시합니다. 챕터 제목은 줄 맨 앞에 ## 을 붙여 주세요.<br />한국어는 한글 포함 여부로 구분합니다. 번역에 한글이 없거나 목표어에 한글이 섞이면 구분이 달라질 수 있으니 미리보기를 확인해 주세요.</FieldDescription>
              <FieldDescription>.txt 한 개 · UTF-8 · 최대 2MB</FieldDescription>
            </Field>
            <Field data-disabled={busyAction === "publish"}>
              <FieldLabel htmlFor="audio-files"><FileTextIcon aria-hidden="true" /> 문장별 음성 파일</FieldLabel>
              <Input
                id="audio-files"
                disabled={busyAction === "publish"}
                type="file"
                accept=".mp3,.m4a,.webm,audio/mpeg,audio/mp4,audio/webm"
                multiple
                aria-describedby="audio-format-help"
                onChange={(event) => selectAudioFiles(event.currentTarget.files)}
              />
              <FieldDescription id="audio-format-help">음성 여러 개 · 프레이즈당 한 개 · 001부터 세 자리 번호 · MP3, M4A, WebM · 파일당 최대 4MB</FieldDescription>
            </Field>
          </FieldGroup>
          <Button
            type="button"
            className="w-full sm:w-fit"
            disabled={!hydrated || busyAction !== null}
            onClick={() => submitImport("/api/admin/drafts/validate", "validate")}
          >
            {busyAction === "validate" ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {busyAction === "validate" ? "검증 중…" : "파일 검증"}
          </Button>
        </form>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {result ? (
          <>
            <DraftPreview result={result} audioResult={audioResult} audioSelected={audioFiles.length > 0} />
            {draftId ? <SyntaxAnalysisStatus key={draftId} draftId={draftId} autoStart /> : null}
            <div className="flex flex-col gap-4">
              {saved ? (
                <Alert role="status"><AlertDescription>
                  {published ? "레슨이 게시되었습니다." : uploadProgress || "초안이 저장되었습니다."}
                </AlertDescription></Alert>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!hydrated || busyAction !== null}
                onClick={() => submitImport("/api/admin/drafts", "save")}
              >
                {busyAction === "save" ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
                {busyAction === "save" ? "저장 중…" : "초안 저장"}
              </Button>
              <Button
                type="button"
                disabled={
                  !hydrated ||
                  busyAction !== null ||
                  published ||
                  !draftId ||
                  !result.publishReady ||
                  !audioResult?.publishReady
                }
                onClick={publishLesson}
              >
                {busyAction === "publish" ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
                {busyAction === "publish" ? (audioUploaded ? "게시 확인 중…" : "업로드 중…") : (audioUploaded ? "게시만 다시 시도" : "음성 업로드 후 게시")}
              </Button>
              </div>
              {audioUploaded && !published ? <Alert role="note"><AlertDescription>음성 업로드가 완료되었습니다. 게시만 다시 시도하면 파일을 재업로드하지 않습니다. 화면을 닫았으면 <Button asChild variant="link"><Link href="/admin/lessons">레슨 관리</Link></Button>에서 이어서 게시할 수 있습니다.</AlertDescription></Alert> : null}
            </div>
          </>
        ) : null}
      </div>
      </ScrollArea>
    </Page>
  );
}

export function AdminPortal({ initialAdmin, replacement }: { initialAdmin: AdminIdentity | null; replacement?: ManagedLesson }) {
  return initialAdmin ? <AdminImport key={replacement?.id ?? "new"} admin={initialAdmin} replacement={replacement} /> : <AdminLogin />;
}
