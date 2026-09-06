"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { isGroupSize } from "@/lib/phrase-groups";
import { resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { AudioSessionControls } from "../../audio-session-controls";
import { RapidSessionControls } from "../../rapid-session-controls";
import { Brand, Page } from "../../ui";

export function DefaultsEditor({ defaults }: { defaults: SessionSettings }) {
  const [settings, setSettings] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function change(changes: Partial<SessionSettings>) {
    setSettings(previous => resolveSessionSettings(changes, previous));
    setMessage("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (!response.ok) throw new Error("save failed");
      setMessage("전역 기본값을 저장했습니다.");
    } catch { setError("전역 기본값을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <Page className="setup-page">
    <header className="quiet-header"><Brand /></header>
    <section className="setup-shell">
      <Link className="back-link" href="/admin">관리자로 돌아가기</Link>
      <h1>전역 학습 기본값</h1>
      <p className="rapid-settings-help">모든 레슨에 적용합니다. 학습자가 변경한 값은 해당 브라우저에서 우선합니다. 진행 중인 세션은 바뀌지 않습니다.</p>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="defaults-fields">
          <section className="setup-section" aria-label="원음 기본값">
            <h2>레벨 1–5 · 원음</h2>
            <div className="session-controls">
              <label className="audio-setting">기본 묶음 크기
                <select value={settings.groupSize} onChange={event => { const groupSize = Number(event.target.value); if (isGroupSize(groupSize)) change({ groupSize }); }}>
                  {[2, 3, 4].map(size => <option key={size} value={size}>{size}개</option>)}
                </select>
              </label>
              <AudioSessionControls level={4} settings={{ ...settings, playbackRate: settings.speed }} onChange={changes => {
                const { playbackRate, ...rest } = changes;
                change({ ...rest, ...(playbackRate !== undefined ? { speed: playbackRate } : {}) });
              }} />
            </div>
          </section>
          <section className="setup-section" aria-label="속사포 기본값">
            <h2>레벨 6–8 · 속사포</h2>
            <div className="session-controls"><RapidSessionControls level={7} settings={settings} onChange={change} /></div>
          </section>
        </fieldset>
        <button type="submit" className="primary-button start-button" disabled={busy}>{busy ? "저장 중…" : "기본값 저장"}</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert" className="admin-form-error">{error}</p> : null}
    </section>
  </Page>;
}
