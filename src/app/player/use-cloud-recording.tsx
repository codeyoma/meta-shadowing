"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isPracticeVerificationCurrent, PRACTICE_CHECK_INTERVAL_MS, PRACTICE_MAX_VERIFICATION_AGE_MS, PracticeError, sendPractice, type PracticeCommand, type PracticeLease, type PracticeErrorCode } from "@/lib/cloud-practice";
import type { CompletionRecord } from "@/lib/learning-records";
import type { CloudRecording, RecordUpdate } from "./recording-types";

export function PracticeFailure({ error, retry, navigate = href => window.location.assign(href) }: { error: string; retry?: () => void; navigate?: (href: string) => void }) {
  const temporary = error === "temporary-error";
  const readFailed = error === "read-failed";
  const auth = ["unauthorized", "account-changed"].includes(error);
  const ownership = ["ownership-lost", "session-busy"].includes(error);
  const lessonChanged = ["lesson-version-changed", "not-found"].includes(error);
  if (error === "learning-disabled") return <Alert aria-label="학습 저장 알림">
    <AlertTitle>계정 학습이 잠시 중지되었습니다.</AlertTitle>
    <AlertDescription>학습을 중지했습니다. 마지막 서버 확인 지점과 완료 기록은 보존되며 브라우저 기록으로 대신 저장하지 않습니다.</AlertDescription>
    <Button variant="outline" onClick={() => navigate("/lessons")}>레슨으로 돌아가기</Button>
  </Alert>;
  return <Alert aria-label="학습 저장 알림">
    <AlertTitle>{readFailed ? "학습 기록을 불러오지 못했습니다." : temporary ? "저장을 확인하지 못했습니다." : auth ? "다시 로그인해 주세요." : ownership ? "다른 기기에서 학습 중이거나 학습 권한이 만료되었습니다." : lessonChanged ? "레슨을 다시 불러와 주세요." : "학습 상태가 변경되었습니다."}</AlertTitle>
    <AlertDescription>{readFailed ? "빈 기록이나 브라우저 기록으로 대체하지 않습니다. 연결을 확인한 뒤 다시 불러와 주세요." : temporary ? "다음 단계로 이동하지 않았습니다. 같은 저장을 다시 시도할 수 있습니다." : ownership ? "다른 기기로 인계되었거나 연결이 만료되어 이 기기의 학습을 중지했습니다. 마지막 서버 확인 지점과 완료 기록은 보존됩니다." : lessonChanged ? "레슨 버전이나 공개 상태가 변경되어 학습을 중지했습니다. 레슨 목록에서 현재 버전을 확인해 주세요. 완료 기록은 보존됩니다." : "마지막 서버 확인 지점과 완료 기록은 보존됩니다."}</AlertDescription>
    {(temporary || readFailed) && retry ? <Button variant="outline" onClick={retry}>{readFailed ? "다시 불러오기" : "저장 재시도"}</Button> : null}
    <Button variant="outline" onClick={() => navigate(auth ? "/login" : "/lessons")}>{auth ? "로그인" : "레슨으로 돌아가기"}</Button>
  </Alert>;
}

type PracticeStatus = "ready" | "saving" | "checking" | "leaving" | "paused" | PracticeErrorCode;
export function useCloudRecording(initial: PracticeLease, instance: string, invalidateAccount: () => void, restart: (lease: PracticeLease) => void) {
  const lease = useRef(initial);
  const [record, setRecord] = useState(initial.record);
  const [status, setStatus] = useState<PracticeStatus>("ready");
  const statusRef = useRef<PracticeStatus>("ready");
  const alive = useRef(true);
  const pending = useRef<{ command: PracticeCommand; resolve: () => void; restartPhrase?: number } | null>(null);
  const inFlight = useRef(false);
  const clock = useRef({ active: false, anchor: 0, total: initial.record.activeMs });
  const lastVerified = useRef(performance.now());
  const lifecycleEpoch = useRef(0);
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
    try {
      let accepted = await sendPractice(operation.command);
      if (operation.command.action === "start" && operation.restartPhrase !== undefined) {
        // Keep each command stable through retries, including a lost start receipt.
        // A new run snapshots account settings, so use its server-defined grouping.
        operation.command = { action: "checkpoint", accountId: initial.accountId, instance,
          runId: accepted.record.runId, generation: accepted.generation, revision: accepted.revision,
          operation: crypto.randomUUID(), kind: "jump", activeMs: 0,
          nextUnit: Math.max(0, accepted.record.unitStarts.findLastIndex(phrase => phrase <= operation.restartPhrase!)) };
        accepted = await sendPractice(operation.command);
      }
      // Even a fast successful receipt may predate a takeover. Revalidate before
      // applying its player transition; the server, not the device clock, expires it.
      const check = { epoch: lifecycleEpoch.current, startedAt: performance.now() };
      accepted = await sendPractice({ action:"renew", accountId:initial.accountId, instance,
        runId:accepted.record.runId, generation:accepted.generation });
      if (!alive.current) return;
      if (!isPracticeVerificationCurrent(check,lifecycleEpoch.current,performance.now())) throw new PracticeError("temporary-error");
      lease.current = accepted; lastVerified.current = check.startedAt; setRecord(accepted.record);
      pending.current = null;
      if (operation.restartPhrase !== undefined) {
        restart(accepted);
        operation.resolve();
        return;
      }
      // Apply the accepted player transition before re-enabling its old button.
      statusRef.current = !accepted.record.completedAt && (document.hidden || !navigator.onLine) ? "paused" : "ready";
      operation.resolve();
      queueMicrotask(() => { if (alive.current) setStatus(statusRef.current); });
    } catch (error) {
      if (error instanceof PracticeError && ["unauthorized","account-changed"].includes(error.code)) { invalidateAccount(); return; }
      if (alive.current) changeStatus(error instanceof PracticeError ? error.code : "temporary-error");
    } finally { inFlight.current = false; }
  }, [changeStatus,track,invalidateAccount,initial.accountId,instance,restart]);
  const renew = useCallback(async function renew(resume = false): Promise<boolean> {
    if (inFlight.current || pending.current || document.hidden || !navigator.onLine || lease.current.record.completedAt) return false;
    if (resume) { changeStatus("checking"); track(false); }
    inFlight.current = true;
    const check = { epoch: lifecycleEpoch.current, startedAt: performance.now() };
    let recheck = false;
    try {
      const accepted = await sendPractice({ action: "renew", ...ownership() });
      if (!alive.current) return false;
      if (!isPracticeVerificationCurrent(check,lifecycleEpoch.current,performance.now())) {
        track(false); changeStatus("paused"); recheck = true; return false;
      }
      lease.current = accepted; lastVerified.current = check.startedAt;
      if (resume || statusRef.current === "checking") changeStatus(document.hidden || !navigator.onLine ? "paused" : "ready");
      return !document.hidden && navigator.onLine;
    } catch (error) {
      track(false);
      if (error instanceof PracticeError && ["unauthorized","account-changed"].includes(error.code)) { invalidateAccount(); return false; }
      if (alive.current) changeStatus(error instanceof PracticeError ? error.code : "temporary-error");
      return false;
    } finally {
      inFlight.current = false;
      if (pending.current) void submit();
      else if (recheck && alive.current && !document.hidden && navigator.onLine) void renew(true);
    }
  }, [changeStatus,ownership,track,submit,invalidateAccount]);
  const updateRecord = useCallback((update: RecordUpdate): void | Promise<void> => {
    track(Boolean(update.active) && statusRef.current === "ready" && !document.hidden && navigator.onLine, update.elapsedMs);
    if (!update.checkpoint && !update.settings) return;
    track(false);
    if (pending.current || statusRef.current !== "ready") return;
    return new Promise<void>(resolve => {
      if (lease.current.record.completedAt && update.kind === "jump" && update.checkpoint) {
        const previous = lease.current.record;
        pending.current = { resolve, restartPhrase: update.checkpoint.phrase, command: {
          action: "start", accountId: initial.accountId, instance, operation: crypto.randomUUID(),
          lessonId: previous.lessonId, lessonVersion: previous.lessonVersion, level: previous.level, stage: previous.stage!,
        } };
        void submit();
        return;
      }
      pending.current = { resolve, command: { action: "checkpoint", ...ownership(), operation: crypto.randomUUID(), revision: lease.current.revision,
        kind: update.settings ? "settings" : update.kind ?? (update.studied ? "studied" : "advance"), nextUnit: update.checkpoint?.unit ?? lease.current.record.nextUnit,
        activeMs: Math.floor(clock.current.total), ...(update.confirmedCycles !== undefined ? { confirmedCycles: update.confirmedCycles } : {}),
        ...(update.settings ? { settings: update.settings } : {}) } };
      void submit();
    });
  }, [ownership,submit,track,initial.accountId,instance]);
  const exit = useCallback((href: string) => {
    if (pending.current && !window.confirm("확인되지 않은 저장이 있습니다. 마지막 서버 확인 지점만 보존됩니다. 나가시겠어요?")) return;
    track(false);
    changeStatus("leaving");
    void sendPractice({ action: "release", ...ownership() }).catch(() => undefined).finally(() => window.location.assign(href));
  }, [changeStatus,ownership,track]);
  useEffect(() => {
    alive.current = true;
    const pause = () => { track(false); if (statusRef.current === "ready" && !lease.current.record.completedAt) changeStatus("paused"); };
    const offline = () => { lifecycleEpoch.current++; pause(); };
    const visibility = () => { lifecycleEpoch.current++; if (document.hidden) pause(); else if (!pending.current && !lease.current.record.completedAt) void renew(true); };
    const timer = window.setInterval(() => {
      if (lease.current.record.completedAt) return;
      if (statusRef.current === "ready" && performance.now()-lastVerified.current >= PRACTICE_MAX_VERIFICATION_AGE_MS) { pause(); void renew(true); }
      else if (statusRef.current === "ready" && performance.now()-lastVerified.current >= PRACTICE_CHECK_INTERVAL_MS) void renew();
    },1000);
    const unload = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    const release = () => {
      track(false);
      void fetch("/api/learner/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "release", ...ownership() }), keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("beforeunload",unload); window.addEventListener("pagehide",release);
    window.addEventListener("offline",offline); window.addEventListener("focus",visibility); document.addEventListener("visibilitychange",visibility);
    return () => {
      alive.current = false; track(false); clearInterval(timer);
      window.removeEventListener("beforeunload",unload); window.removeEventListener("pagehide",release);
      window.removeEventListener("offline",offline); window.removeEventListener("focus",visibility); document.removeEventListener("visibilitychange",visibility);
    };
  }, [changeStatus,ownership,renew,track]);
  const recording: CloudRecording = { completion: record.completedAt ? record as CompletionRecord : null, blocked: status !== "ready", updateRecord, exit, verifyResume: () => renew(true),
    canAct: () => {
      if (statusRef.current !== "ready" || document.hidden || !navigator.onLine) return false;
      // Completion is read-only and must not keep a device lease alive. An
      // explicit jump acquires a new server-fenced run before enabling practice.
      if (lease.current.record.completedAt) return true;
      if (performance.now()-lastVerified.current < PRACTICE_MAX_VERIFICATION_AGE_MS) return true;
      void renew(true); return false;
    } };
  const notice = status === "ready" ? null : ["saving","checking","leaving"].includes(status) ? <p role="status">서버 확인 중…</p>
    : status === "paused" ? <Button variant="outline" onClick={() => void renew(true)}>학습 연결 확인</Button>
    : <PracticeFailure error={status} retry={() => pending.current ? void submit() : void renew(true)} navigate={exit} />;
  return { recording, notice };
}
