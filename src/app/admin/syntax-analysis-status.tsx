"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { syntaxErrorMessage, type SyntaxProgress } from "@/lib/sentence-syntax";

export function SyntaxAnalysisStatus({ draftId, autoStart = false }: { draftId: string; autoStart?: boolean }) {
  const [progress, setProgress] = useState<SyntaxProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState({ serial: 0, enabled: autoStart, retry: false });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick(method: "GET" | "POST", retry = false) {
      try {
        const response = await fetch(`/api/admin/drafts/${draftId}/syntax${retry ? "?retry=failed" : ""}`, {
          method, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)])
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "구문 분석 상태를 불러오지 못했습니다.");
        if (controller.signal.aborted) return;
        const next = payload as SyntaxProgress;
        setProgress(next);
        const firstRetry = method === "GET" && run.retry && next.failed > 0;
        if (run.enabled && next.configured && (next.pending + next.processing > 0 || firstRetry)) {
          // Only the first batch retries failed rows; later failures wait for an
          // explicit retry instead of repeatedly billing an automatic loop.
          timer = setTimeout(() => void tick("POST", firstRetry), next.pending || firstRetry ? 100 : 5000);
        } else setBusy(false);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "분석을 완료하지 못했습니다.");
        setBusy(false);
      }
    }
    setError("");
    setBusy(true);
    void tick("GET");
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [draftId, run]);

  return <section aria-label="문장 구문 분석" className="flex flex-col gap-3 rounded-xl border p-4">
    <h3 className="font-semibold">문장 구문 분석</h3>
    <p aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
      {progress ? `${progress.total}문장 중 ${progress.complete}문장 저장 · 대기 ${progress.pending} · 처리 중 ${progress.processing} · 실패 ${progress.failed}` : "분석 상태 확인 중…"}
    </p>
    {progress && !progress.configured && progress.total > progress.complete ? <Alert><AlertDescription>
      Google Cloud 인증 정보가 아직 설정되지 않았습니다. 초안과 분석 대기 문장은 저장되어 있습니다. 서버 설정 후 분석 시작을 눌러 주세요.
    </AlertDescription></Alert> : null}
    {progress && progress.total > 0 ? <p className="text-xs text-muted-foreground">
      이 초안 전체의 예상 분석량: {progress.estimatedUnits.toLocaleString()}단위. 완료된 문장은 다시 호출하지 않습니다.
      {busy && progress.configured ? " 이 화면을 열어 두면 순서대로 분석합니다. 화면을 닫으면 레슨 관리에서 이어서 시작할 수 있습니다." : ""}
    </p> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {progress?.errors.map(code => <p key={code} className="text-sm text-destructive">{syntaxErrorMessage(code)}</p>)}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => setRun(value => ({ serial: value.serial + 1, enabled: true, retry: false }))}>
        {busy ? <Spinner aria-hidden="true" /> : null}
        {busy ? "분석 상태 확인 중…" : progress && progress.complete === progress.total ? "상태 새로고침" : "분석 시작 / 이어서 분석"}
      </Button>
      {progress && progress.failed > 0 ? <Button type="button" variant="outline" disabled={busy} onClick={() => setRun(value => ({ serial: value.serial + 1, enabled: true, retry: true }))}>실패한 문장 다시 분석</Button> : null}
    </div>
  </section>;
}
