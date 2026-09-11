"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionableDialog } from "./actionable-dialog";
import { useDeviceLearningSync } from "./device-learning-sync-provider";
import { createAccountSnapshotTransfer, type TransferState } from "@/lib/account-snapshot-transfer";
import { hasDeviceSnapshotBackup, subscribeDeviceSnapshot } from "@/lib/device-learning-store";
import { useDeviceAccess } from "./device-access-provider";

export function AccountSnapshotControls() {
  const access = useDeviceAccess();
  const { flush } = useDeviceLearningSync();
  const dialogs = useActionableDialog();
  const controller = useRef<ReturnType<typeof createAccountSnapshotTransfer> | null>(null);
  const lastAction = useRef<"upload" | "download" | "recovery">("upload");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<TransferState>({ phase: "idle" });
  const [backup, setBackup] = useState(false);
  useEffect(() => {
    if (!access) return;
    let alive = true;
    const transfer = createAccountSnapshotTransfer(access, setState, flush);
    controller.current = transfer;
    const refresh = () => { void hasDeviceSnapshotBackup(access).then(value => { if (alive) setBackup(value); }).catch(() => { if (alive) setBackup(false); }); };
    refresh();
    const unsubscribe = subscribeDeviceSnapshot(refresh);
    return () => { alive = false; transfer.dispose(); controller.current = null; unsubscribe(); dialogs.resolve(access.accountId, "transfer"); };
  }, [access, flush, dialogs]);
  const confirming = state.phase === "confirm-download" || state.phase === "confirm-recovery";
  const disabled = !access || state.phase === "busy" || confirming;
  useEffect(() => {
    if (!access) return;
    const recovery = state.phase === "confirm-recovery";
    if (confirming) {
      dialogs.show({ scope: access.accountId, key: "transfer", explicit: true, returnFocus: trigger.current,
        title: recovery ? "이전 기기 기록을 복구할까요?" : "기기 학습 기록을 교체할까요?",
        description: recovery ? "현재 기록과 이 기기에 보관된 이전 기록을 서로 바꿉니다. 복구 후 다시 되돌릴 수 있습니다." : "계정에서 가져온 기록으로 현재 기기 기록을 교체합니다. 교체 직전 기록은 이 기기에서 복구할 수 있습니다. 학습 패키지와 음원은 포함되지 않습니다.",
        dismissLabel: "취소", onDismiss: () => controller.current?.cancel(),
        action: { label: recovery ? "기록 복구" : "기록 교체", run: () => void controller.current?.confirm() } });
    } else if (state.message) {
      const terminal = state.problem && ["invalid-merge", "client-update-required", "merge-limit"].includes(state.problem);
      dialogs.show({ scope: access.accountId, key: terminal ? `sync:${state.problem}` : "transfer", explicit: true, returnFocus: trigger.current, title: "학습 기록 전송을 확인해 주세요.", description: state.message,
        action: { label: "다시 시도", run: () => void controller.current?.[lastAction.current]() } });
    } else {
      dialogs.resolve(access.accountId, "transfer");
    }
  }, [access, state, confirming, dialogs]);
  return <section className="mt-6 flex flex-col gap-3" aria-label="학습 기록 전송">
    <h2 className="font-semibold">학습 기록 전송</h2>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={disabled} onClick={event => { trigger.current = event.currentTarget; lastAction.current = "upload"; void controller.current?.upload(); }}>지금 동기화</Button>
      <Button variant="outline" disabled={disabled} onClick={event => { trigger.current = event.currentTarget; lastAction.current = "download"; void controller.current?.download(); }}>계정에서 다운로드</Button>
      <Button variant="outline" disabled={disabled || !backup} onClick={event => { trigger.current = event.currentTarget; lastAction.current = "recovery"; controller.current?.recovery(); }}>이전 기기 기록 복구</Button>
    </div>
    {state.phase === "busy" ? <p role="status">학습 기록을 처리하고 있어요…</p> : null}
  </section>;
}
