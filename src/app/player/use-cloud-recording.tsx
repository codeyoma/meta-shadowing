"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PracticeError, sendPractice, type PracticeCommand, type PracticeLease, type PracticeErrorCode } from "@/lib/cloud-practice";
import type { CompletionRecord } from "@/lib/learning-records";
import type { CloudRecording, RecordUpdate } from "./use-learning-record";

export function PracticeFailure({ error, retry, navigate = href => window.location.assign(href) }: { error: string; retry?: () => void; navigate?: (href: string) => void }) {
  const temporary = error === "temporary-error";
  const auth = ["unauthorized", "account-changed"].includes(error);
  const ownership = ["ownership-lost", "session-busy"].includes(error);
  return <Alert aria-label="학습 저장 알림">
    <AlertTitle>{temporary ? "저장을 확인하지 못했습니다." : auth ? "다시 로그인해 주세요." : ownership ? "다른 기기에서 학습 중이거나 학습 권한이 만료되었습니다." : "학습 상태가 변경되었습니다."}</AlertTitle>
    <AlertDescription>{temporary ? "다음 단계로 이동하지 않았습니다. 같은 저장을 다시 시도할 수 있습니다." : "마지막 서버 확인 지점과 완료 기록은 보존됩니다."}</AlertDescription>
    {temporary && retry ? <Button variant="outline" onClick={retry}>저장 재시도</Button> : null}
    <Button variant="outline" onClick={() => navigate(auth ? "/login" : "/lessons")}>{auth ? "로그인" : "레슨으로 돌아가기"}</Button>
  </Alert>;
}

type PracticeStatus = "ready" | "saving" | "checking" | "leaving" | "paused" | PracticeErrorCode;
export function useCloudRecording(initial: PracticeLease, instance: string, invalidateAccount: () => void) {
  const lease = useRef(initial);
  const [record, setRecord] = useState(initial.record);
  const [status, setStatus] = useState<PracticeStatus>("ready");
  const statusRef = useRef<PracticeStatus>("ready");
  const alive = useRef(true);
  const pending = useRef<{ command: PracticeCommand; resolve: () => void } | null>(null);
  const inFlight = useRef(false);
  const clock = useRef({ active: false, anchor: 0, total: initial.record.activeMs });
  const lastVerified = useRef(performance.now());
  const visibilityEpoch = useRef(0);
  const changeStatus = useCallback((next: PracticeStatus) => { statusRef.current = next; setStatus(next); }, []);
  const track = useCallback((active: boolean, elapsedMs = 0) => {
    const now = performance.now(), value = clock.current;
    if (value.active) value.total += Math.max(0,now-value.anchor);
    value.total += elapsedMs;
    value.active = active; value.anchor = now;
  }, []);
  const ownership = useCallback(() => ({ accountId: initial.accountId, instance, runId: lease.current.record.runId, generation: lease.current.generation }), [initial.accountId,instance]);
  const submit = useCallback(async () => {
    const operation = pending.current;
    if (!operation || inFlight.current) return;
    inFlight.current = true; changeStatus("saving"); track(false);
    const sentAt = performance.now(), epoch = visibilityEpoch.current;
    try {
      let accepted = await sendPractice(operation.command);
      // A replay carries its original acknowledgment, not a fresh lease. Likewise
      // an acknowledgment held across backgrounding must not resume stale audio.
      if (!document.hidden && (epoch !== visibilityEpoch.current || performance.now()-sentAt > 8000 || Date.parse(accepted.leaseUntil)-Date.now() < 10000)) {
        accepted = await sendPractice({ action:"renew", accountId:initial.accountId, instance,
          runId:accepted.record.runId, generation:accepted.generation });
      }
      if (!alive.current) return;
      lease.current = accepted; lastVerified.current = performance.now(); setRecord(accepted.record);
      pending.current = null;
      // Apply the accepted player transition before re-enabling its old button.
      statusRef.current = document.hidden ? "paused" : "ready";
      operation.resolve();
      queueMicrotask(() => { if (alive.current) setStatus(statusRef.current); });
    } catch (error) {
      if (error instanceof PracticeError && ["unauthorized","account-changed"].includes(error.code)) { invalidateAccount(); return; }
      if (alive.current) changeStatus(error instanceof PracticeError ? error.code : "temporary-error");
    } finally { inFlight.current = false; }
  }, [changeStatus,track,invalidateAccount,initial.accountId,instance]);
  const renew = useCallback(async (resume = false) => {
    if (inFlight.current || pending.current || document.hidden || !navigator.onLine || record.completedAt) return false;
    if (resume) { changeStatus("checking"); track(false); }
    inFlight.current = true;
    try {
      const accepted = await sendPractice({ action: "renew", ...ownership() });
      if (!alive.current) return false;
      lease.current = accepted; lastVerified.current = performance.now();
      if (resume || statusRef.current === "checking") changeStatus(document.hidden ? "paused" : "ready");
      return !document.hidden;
    } catch (error) {
      track(false);
      if (error instanceof PracticeError && ["unauthorized","account-changed"].includes(error.code)) { invalidateAccount(); return false; }
      if (alive.current) changeStatus(error instanceof PracticeError ? error.code : "temporary-error");
      return false;
    } finally { inFlight.current = false; if (pending.current) void submit(); }
  }, [changeStatus,ownership,record.completedAt,track,submit,invalidateAccount]);
  const updateRecord = useCallback((update: RecordUpdate): void | Promise<void> => {
    track(Boolean(update.active) && statusRef.current === "ready" && !document.hidden && navigator.onLine, update.elapsedMs);
    if (!update.checkpoint && !update.settings) return;
    track(false);
    if (pending.current || statusRef.current !== "ready") return;
    return new Promise<void>(resolve => {
      pending.current = { resolve, command: { action: "checkpoint", ...ownership(), operation: crypto.randomUUID(), revision: lease.current.revision,
        kind: update.settings ? "settings" : update.kind ?? (update.studied ? "studied" : "advance"), nextUnit: update.checkpoint?.unit ?? lease.current.record.nextUnit,
        activeMs: Math.floor(clock.current.total), ...(update.confirmedCycles !== undefined ? { confirmedCycles: update.confirmedCycles } : {}),
        ...(update.settings ? { settings: update.settings } : {}) } };
      void submit();
    });
  }, [ownership,submit,track]);
  const exit = useCallback((href: string) => {
    if (pending.current && !window.confirm("확인되지 않은 저장이 있습니다. 마지막 서버 확인 지점만 보존됩니다. 나가시겠어요?")) return;
    track(false);
    changeStatus("leaving");
    void sendPractice({ action: "release", ...ownership() }).catch(() => undefined).finally(() => window.location.assign(href));
  }, [changeStatus,ownership,track]);
  useEffect(() => {
    alive.current = true;
    const pause = () => { track(false); if (statusRef.current === "ready") changeStatus("paused"); };
    const visibility = () => { visibilityEpoch.current++; if (document.hidden) pause(); else if (!pending.current) void renew(true); };
    const timer = window.setInterval(() => {
      if (statusRef.current === "ready" && performance.now()-lastVerified.current > 10000) { pause(); void renew(true); }
      else if (statusRef.current === "ready") void renew();
    },8000);
    const unload = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    const release = () => {
      track(false);
      void fetch("/api/learner/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release", ...ownership() }), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("beforeunload",unload); window.addEventListener("pagehide",release);
    window.addEventListener("offline",pause); window.addEventListener("focus",visibility); document.addEventListener("visibilitychange",visibility);
    return () => {
      alive.current = false; track(false); clearInterval(timer);
      window.removeEventListener("beforeunload",unload); window.removeEventListener("pagehide",release);
      window.removeEventListener("offline",pause); window.removeEventListener("focus",visibility); document.removeEventListener("visibilitychange",visibility);
    };
  }, [changeStatus,ownership,renew,track]);
  const recording: CloudRecording = { completion: record.completedAt ? record as CompletionRecord : null, blocked: status !== "ready", updateRecord, exit, verifyResume: () => renew(true),
    canAct: () => {
      if (statusRef.current !== "ready" || document.hidden || !navigator.onLine) return false;
      if (performance.now()-lastVerified.current <= 10000) return true;
      void renew(true); return false;
    } };
  const notice = status === "ready" ? null : ["saving","checking","leaving"].includes(status) ? <p role="status">서버 확인 중…</p>
    : status === "paused" ? <Button variant="outline" onClick={() => void renew(true)}>학습 연결 확인</Button>
    : <PracticeFailure error={status} retry={() => pending.current ? void submit() : void renew(true)} navigate={exit} />;
  return { recording, notice };
}
