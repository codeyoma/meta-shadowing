"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  return <Page className="px-4 pb-4 sm:px-8">
    <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 py-6"><Brand /><Button asChild variant="ghost"><Link href="/admin">관리자로 돌아가기</Link></Button></header>
    <ScrollArea className="mx-auto w-full max-w-3xl flex-1" viewportProps={{ role: "region", "aria-label": "전역 학습 설정" }}>
    <section className="flex min-w-0 flex-col gap-8 px-2 pt-6 pb-4">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-bold text-display">전역 학습 기본값</h1>
        <p className="text-muted-foreground">모든 레슨에 적용합니다. 학습자가 변경한 값은 해당 브라우저에서 우선합니다. 진행 중인 세션은 바뀌지 않습니다.</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-8">
        <FieldSet disabled={busy}>
          <FieldGroup className="gap-8">
          <FieldSet aria-label="원음 기본값">
            <FieldLegend><h2>레벨 1–5 · 원음</h2></FieldLegend>
            <FieldGroup>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="default-group-size">기본 묶음 크기</FieldLabel>
                <NativeSelect id="default-group-size" value={settings.groupSize} onChange={event => { const groupSize = Number(event.target.value); if (isGroupSize(groupSize)) change({ groupSize }); }}>
                  {[2, 3, 4].map(size => <NativeSelectOption key={size} value={size}>{size}개</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <AudioSessionControls level={4} settings={{ ...settings, playbackRate: settings.speed }} onChange={changes => {
                const { playbackRate, ...rest } = changes;
                change({ ...rest, ...(playbackRate !== undefined ? { speed: playbackRate } : {}) });
              }} />
            </FieldGroup>
          </FieldSet>
          <FieldSet aria-label="속사포 기본값">
            <FieldLegend><h2>레벨 6–8 · 속사포</h2></FieldLegend>
            <FieldGroup><RapidSessionControls level={7} settings={settings} onChange={change} /></FieldGroup>
          </FieldSet>
          </FieldGroup>
        </FieldSet>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}{busy ? "저장 중…" : "기본값 저장"}</Button>
      </form>
      {message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </section>
    </ScrollArea>
  </Page>;
}
