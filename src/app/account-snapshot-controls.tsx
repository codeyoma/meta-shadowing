"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { createAccountSnapshotTransfer, type TransferState } from "@/lib/account-snapshot-transfer";
import { hasDeviceSnapshotBackup, subscribeDeviceSnapshot } from "@/lib/device-learning-store";
import { useDeviceAccess } from "./device-access-provider";

export function AccountSnapshotControls() {
  const access = useDeviceAccess();
  const controller = useRef<ReturnType<typeof createAccountSnapshotTransfer> | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pendingFocusReturn = useRef(false);
  const cancel = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<TransferState>({ phase: "idle" });
  const [backup, setBackup] = useState(false);
  useEffect(() => {
    if (!access) return;
    let alive = true;
    const transfer = createAccountSnapshotTransfer(access, setState);
    controller.current = transfer;
    const refresh = () => { void hasDeviceSnapshotBackup(access).then(value => { if (alive) setBackup(value); }).catch(() => { if (alive) setBackup(false); }); };
    refresh();
    const unsubscribe = subscribeDeviceSnapshot(refresh);
    return () => { alive = false; transfer.dispose(); controller.current = null; unsubscribe(); };
  }, [access]);
  const confirming = state.phase === "confirm-download" || state.phase === "confirm-recovery";
  const disabled = !access || state.phase === "busy" || confirming;
  useEffect(() => {
    if (!disabled && pendingFocusReturn.current) {
      pendingFocusReturn.current = false;
      trigger.current?.focus();
    }
  }, [disabled]);
  const recovery = state.phase === "confirm-recovery";
  return <section className="mt-6 space-y-3" aria-label="학습 기록 전송">
    <h2 className="font-semibold">학습 기록 전송</h2>
    <p className="text-sm text-muted-foreground">직접 버튼을 누를 때만 계정과 학습 기록을 주고받습니다. 다운로드는 이 기기의 기록을 교체하며, 교체 전 기록은 이 기기에 한 번 보관됩니다. 학습 패키지와 음원은 별도로 다운로드해야 합니다.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={disabled} onClick={() => void controller.current?.upload()}>계정에 업로드</Button>
      <Button variant="outline" disabled={disabled} onClick={event => { trigger.current = event.currentTarget; void controller.current?.download(); }}>계정에서 다운로드</Button>
      <Button variant="outline" disabled={disabled || !backup} onClick={event => { trigger.current = event.currentTarget; controller.current?.recovery(); }}>이전 기기 기록 복구</Button>
    </div>
    {state.phase === "busy" ? <p role="status">학습 기록을 처리하고 있어요…</p> : null}
    {state.message ? <Alert role={state.phase === "error" ? "alert" : "status"}><AlertDescription>{state.message}</AlertDescription></Alert> : null}
    <Dialog open={confirming} onOpenChange={open => { if (!open) controller.current?.cancel(); }}>
      <DialogContent role="alertdialog" showCloseButton={false}
        onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (trigger.current?.disabled) pendingFocusReturn.current = true;
          else trigger.current?.focus();
        }}>
        <DialogTitle>{recovery ? "이전 기기 기록을 복구할까요?" : "기기 학습 기록을 교체할까요?"}</DialogTitle>
        <DialogDescription>{recovery ? "현재 기록과 이 기기에 보관된 이전 기록을 서로 바꿉니다. 복구 후 다시 되돌릴 수 있습니다." : "계정에서 가져온 기록으로 현재 기기 기록을 교체합니다. 교체 직전 기록은 이 기기에서 복구할 수 있습니다. 학습 패키지와 음원은 포함되지 않습니다."}</DialogDescription>
        <DialogFooter>
          <Button ref={cancel} variant="outline" onClick={() => controller.current?.cancel()}>취소</Button>
          <Button onClick={() => void controller.current?.confirm()}>{recovery ? "기록 복구" : "기록 교체"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
