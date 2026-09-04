"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AdminIdentity } from "@/lib/admin-auth";
import type { LessonDraftParseResult } from "@/lib/lesson-draft-parser";
import { Brand, Page } from "../ui";

type ImportResponse = {
  draftId?: string;
  error?: string;
  result?: LessonDraftParseResult;
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

function DraftPreview({ result }: { result: LessonDraftParseResult }) {
  const summary = `${result.summary.phrases}개 프레이즈 · ${result.summary.chapters}개 챕터 · ${result.summary.sections}개 구간`;

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
      <div className="preview-table-wrap">
        <table className="preview-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">순서</th>
              <th scope="col" role="columnheader">구분</th>
              <th scope="col" role="columnheader">목표어</th>
              <th scope="col" role="columnheader">한국어</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {result.entries.map((entry, index) => {
              if (entry.kind === "section") {
                return (
                  <tr className="preview-section-row" role="row" key={`section-${entry.sourceLine}-${index}`}>
                    <td role="cell">—</td>
                    <td role="cell" colSpan={3}>이름 없는 구간</td>
                  </tr>
                );
              }
              return (
                <tr role="row" className={entry.kind === "chapter" ? "preview-chapter-row" : ""} key={`${entry.kind}-${entry.sourceLine}-${index}`}>
                  <td role="cell">{entry.kind === "phrase" ? entry.phraseNumber : "—"}</td>
                  <td role="cell">{entry.kind === "chapter" ? "챕터" : "프레이즈"}</td>
                  <td role="cell">{entry.target || "(비어 있음)"}</td>
                  <td role="cell">{entry.korean || "(비어 있음)"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminImport({ admin }: { admin: AdminIdentity }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<LessonDraftParseResult | null>(null);
  const [busyAction, setBusyAction] = useState<"validate" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => setHydrated(true), []);

  function clearImportResult() {
    setResult(null);
    setSaved(false);
    setError("");
  }

  async function submitImport(path: string, action: "validate" | "save") {
    if (!formRef.current) return;
    if (!formRef.current.reportValidity()) return;
    setBusyAction(action);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(path, { method: "POST", body: new FormData(formRef.current) });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok || !payload.result) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      setResult(payload.result);
      setSaved(action === "save" && Boolean(payload.draftId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 처리하지 못했습니다.");
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
          <span>{admin.email}</span>
          <button type="button" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <div className="admin-workspace">
        <div className="admin-page-title">
          <p>관리자</p>
          <h1>새 레슨 가져오기</h1>
        </div>
        <form
          ref={formRef}
          className="import-form"
          data-admin-ready={hydrated ? "true" : "false"}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="import-metadata">
            <label htmlFor="lesson-title">레슨 제목</label>
            <input id="lesson-title" name="title" maxLength={120} required />
            <label htmlFor="lesson-language">언어</label>
            <select id="lesson-language" name="language" defaultValue="english">
              <option value="english">English 영어</option>
              <option value="japanese">日本語 일본어</option>
            </select>
          </div>
          <div className="import-files">
            <label className="file-field" htmlFor="target-file">
              <span><FileIcon /> 목표어 텍스트</span>
              <input
                id="target-file"
                name="targetFile"
                type="file"
                accept=".txt,text/plain"
                required
                onChange={clearImportResult}
              />
            </label>
            <label className="file-field" htmlFor="korean-file">
              <span><FileIcon /> 한국어 텍스트</span>
              <input
                id="korean-file"
                name="koreanFile"
                type="file"
                accept=".txt,text/plain"
                required
                onChange={clearImportResult}
              />
            </label>
            <p>.txt · UTF-8 · 파일당 최대 2MB</p>
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
            <DraftPreview result={result} />
            <div className="draft-actions">
              {saved ? <p role="status">초안이 저장되었습니다.</p> : <span />}
              <button
                type="button"
                className="secondary-button"
                disabled={!hydrated || busyAction !== null}
                onClick={() => submitImport("/api/admin/drafts", "save")}
              >
                {busyAction === "save" ? "저장 중…" : "초안 저장"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Page>
  );
}

export function AdminPortal({ initialAdmin }: { initialAdmin: AdminIdentity | null }) {
  return initialAdmin ? <AdminImport admin={initialAdmin} /> : <AdminLogin />;
}
