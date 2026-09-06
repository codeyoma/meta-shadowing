"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AdminIdentity } from "@/lib/admin-auth";
import type { ManagedLesson } from "@/lib/lesson-management";
import { mapAudioPackage, type AudioPackageResult } from "@/lib/audio-package";
import { hasSupportedAudioSignature } from "@/lib/audio-signature";
import {
  LESSON_AUDIO_BUCKET,
  getLessonAudioFolder,
  getLessonAudioPath
} from "@/lib/lesson-audio";
import type { LessonDraftParseResult } from "@/lib/lesson-draft-parser";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Brand, Page } from "../ui";

type ImportResponse = {
  draftId?: string;
  error?: string;
  result?: LessonDraftParseResult;
};

type PublishResponse = {
  error?: string;
  message?: string;
  lessonId?: string;
  result?: AudioPackageResult;
};

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5M10 12h5M10 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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
    <Page className="admin-login-page">
      <section className="admin-login-shell">
        <Brand />
        <div className="admin-login-panel">
          <p className="admin-kicker">관리자</p>
          <h1>관리자 로그인</h1>
          <p>등록된 관리자 이메일로 일회용 코드를 받으세요.</p>
          {step === "email" ? (
            <form onSubmit={requestCode} className="admin-auth-form">
              <label htmlFor="admin-email">이메일</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
              <button className="primary-button" type="submit" disabled={busy}>
                로그인 코드 받기
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="admin-auth-form">
              <span className="auth-email">{email}</span>
              <label htmlFor="admin-token">인증 코드</label>
              <input
                id="admin-token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                required
              />
              <button className="primary-button" type="submit" disabled={busy}>
                확인하고 계속
              </button>
            </form>
          )}
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        </div>
      </section>
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
    <section className="draft-preview" aria-labelledby="preview-title">
      <div className="preview-title-row">
        <h2 id="preview-title">검증 미리보기</h2>
        <strong className={result.publishReady ? "preview-ready" : "preview-blocked"}>
          {result.publishReady ? "검증 완료" : "게시 준비 불가"}
        </strong>
      </div>
      <p className={`validation-summary ${result.publishReady ? "is-valid" : "is-invalid"}`}>
        {summary} · {result.issues.length ? `${result.issues.length}개 오류` : "오류 없음"}
      </p>
      {result.issues.length ? (
        <div className="validation-errors" role="alert">
          <ul>
            {result.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.sourceLine}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="audio-package-summary" aria-labelledby="audio-package-title">
        <div>
          <h3 id="audio-package-title">문장별 음성</h3>
          {audioResult ? (
            <strong className={audioResult.publishReady ? "preview-ready" : "preview-blocked"}>
              {audioResult.items.length} / {result.summary.phrases} 연결 · {audioResult.publishReady ? "게시 가능" : "확인 필요"}
            </strong>
          ) : (
            <strong className="preview-blocked">파일 선택 필요</strong>
          )}
        </div>
        {!audioSelected ? <p>MP3, M4A, WebM 파일을 001부터 프레이즈 순서대로 선택해 주세요. 여러 줄인 프레이즈에도 음성은 한 개입니다.</p> : null}
        {audioResult?.issues.length ? (
          <div className="validation-errors audio-errors" role="alert">
            <ul>
              {audioResult.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.fileName ?? issue.phraseNumber}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <div className="preview-table-wrap">
        <table className="preview-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">순서</th>
              <th scope="col" role="columnheader">구분</th>
              <th scope="col" role="columnheader">목표어</th>
              <th scope="col" role="columnheader">한국어</th>
              <th scope="col" role="columnheader">음성</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {result.entries.map((entry, index) => {
              if (entry.kind === "section") {
                return (
                  <tr className="preview-section-row" role="row" key={`section-${entry.sourceLine}-${index}`}>
                    <td role="cell">—</td>
                    <td role="cell" colSpan={4}>이름 없는 구간</td>
                  </tr>
                );
              }
              return (
                <tr role="row" className={entry.kind === "chapter" ? "preview-chapter-row" : ""} key={`${entry.kind}-${entry.sourceLine}-${index}`}>
                  <td role="cell">{entry.kind === "phrase" ? entry.phraseNumber : "—"}</td>
                  <td role="cell">{entry.kind === "chapter" ? "챕터" : "프레이즈"}</td>
                  <td role="cell" className="preview-text-cell">{entry.target || "(비어 있음)"}</td>
                  <td role="cell" className="preview-text-cell">{entry.korean || (entry.kind === "chapter" ? "—" : "(비어 있음)")}</td>
                  <td role="cell" className="preview-audio-cell">
                    {entry.kind === "phrase" ? audioByPhrase.get(entry.phraseNumber)?.originalName ?? "미연결" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const audioResult = useMemo(
    () => (result && audioFiles.length ? mapAudioPackage(result.entries, audioFiles) : null),
    [audioFiles, result]
  );

  useEffect(() => setHydrated(true), []);

  function clearImportResult() {
    importRevisionRef.current += 1;
    setResult(null);
    setSaved(false);
    setDraftId(null);
    setPublished(false);
    setUploadProgress("");
    setError("");
  }

  function clearSavedDraft() {
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

      setUploadProgress("게시 확인 중");
      const response = await fetch(`/api/admin/drafts/${draftId}/publish`, { method: "POST" });
      const payload = (await response.json()) as PublishResponse;
      if (!response.ok || !payload.lessonId) {
        throw new Error(payload.message || "레슨을 게시하지 못했습니다.");
      }
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
    <Page className="admin-page">
      <header className="admin-header">
        <div className="admin-brand-row">
          <Brand compact />
          <span>관리자</span>
        </div>
        <div className="admin-account">
          <Link href="/admin/lessons">레슨 관리</Link>
          <Link href="/admin/settings">전역 학습 기본값</Link>
          <span>{admin.email}</span>
          <button type="button" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <div className="admin-workspace">
        <div className="admin-page-title">
          <h1>{replacement ? "레슨 새 버전 가져오기" : "새 레슨 가져오기"}</h1>
          {replacement ? <p className="replacement-note">새 파일을 검증하고 게시하면 “{replacement.title}”을 교체합니다. 그전까지 현재 레슨은 유지됩니다.</p> : null}
        </div>
        <form
          ref={formRef}
          className="import-form"
          data-admin-ready={hydrated ? "true" : "false"}
          onSubmit={(event) => event.preventDefault()}
        >
          {replacement ? <input type="hidden" name="replacementFor" value={replacement.id} /> : null}
          <div className="import-metadata">
            <label htmlFor="lesson-title">레슨 제목</label>
            <input id="lesson-title" name="title" defaultValue={replacement?.title} maxLength={120} required onChange={clearSavedDraft} />
            <label htmlFor="lesson-language">언어</label>
            {replacement ? <input type="hidden" name="language" value={replacement.language} /> : null}
            <select id="lesson-language" name="language" defaultValue={replacement?.language ?? "english"} disabled={!!replacement} onChange={clearSavedDraft}>
              <option value="english">English 영어</option>
              <option value="japanese">日本語 일본어</option>
            </select>
          </div>
          <div className="import-files">
            <label className="file-field" htmlFor="script-file">
              <span><FileIcon /> 통합 스크립트</span>
              <input
                id="script-file"
                name="scriptFile"
                type="file"
                accept=".txt,text/plain"
                aria-describedby="script-format-help"
                required
                onChange={clearImportResult}
              />
            </label>
            <label className="file-field audio-file-field" htmlFor="audio-files">
              <span><FileIcon /> 문장별 음성 파일</span>
              <input
                id="audio-files"
                type="file"
                accept=".mp3,.m4a,.webm,audio/mpeg,audio/mp4,audio/webm"
                multiple
                onChange={(event) => selectAudioFiles(event.currentTarget.files)}
              />
            </label>
            <p id="script-format-help">TXT 한 파일에 목표어 묶음 → 한국어 묶음 순서로 넣어 주세요. 연속된 여러 줄도 한 프레이즈이며, 빈 줄은 무시합니다. 챕터 제목은 줄 맨 앞에 ## 을 붙여 주세요.<br />한국어는 한글 포함 여부로 구분합니다. 번역에 한글이 없거나 목표어에 한글이 섞이면 구분이 달라질 수 있으니 미리보기를 확인해 주세요.</p>
            <p>.txt 한 개 · UTF-8 · 최대 2MB<br />음성 여러 개 · 프레이즈당 한 개 · 001부터 세 자리 번호 · MP3, M4A, WebM · 파일당 최대 4MB</p>
          </div>
          <button
            type="button"
            className="primary-button validate-button"
            disabled={!hydrated || busyAction !== null}
            onClick={() => submitImport("/api/admin/drafts/validate", "validate")}
          >
            {busyAction === "validate" ? "검증 중…" : "파일 검증"}
          </button>
        </form>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        {result ? (
          <>
            <DraftPreview result={result} audioResult={audioResult} audioSelected={audioFiles.length > 0} />
            <div className="draft-actions">
              {saved ? (
                <p role="status">
                  {published ? "레슨이 게시되었습니다." : uploadProgress || "초안이 저장되었습니다."}
                </p>
              ) : <span />}
              <button
                type="button"
                className="secondary-button"
                disabled={!hydrated || busyAction !== null}
                onClick={() => submitImport("/api/admin/drafts", "save")}
              >
                {busyAction === "save" ? "저장 중…" : "초안 저장"}
              </button>
              <button
                type="button"
                className="primary-button publish-button"
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
                {busyAction === "publish" ? "업로드 중…" : "음성 업로드 후 게시"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Page>
  );
}

export function AdminPortal({ initialAdmin, replacement }: { initialAdmin: AdminIdentity | null; replacement?: ManagedLesson }) {
  return initialAdmin ? <AdminImport key={replacement?.id ?? "new"} admin={initialAdmin} replacement={replacement} /> : <AdminLogin />;
}
