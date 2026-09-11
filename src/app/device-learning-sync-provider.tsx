"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DeviceAccess } from "@/lib/device-access";
import { createDeviceLearningSync, LearningSyncError, type DeviceLearningSync, type LearningSyncProblemCode } from "@/lib/device-learning-sync";
import { useActionableDialog, useActionableProblem, type ActionableProblem } from "./actionable-dialog";

export type DeviceLearningSyncControl = { problem: LearningSyncProblemCode | null; flush(): Promise<void> };
const Context = createContext<DeviceLearningSyncControl | null>(null);
export function useDeviceLearningSync(): DeviceLearningSyncControl {
  const control = useContext(Context);
  if (!control) throw new Error("Device learning sync requires verified device access");
  return control;
}

/** The access provider mounts this once for browse, player and offline entry. */
export function DeviceLearningSyncProvider({ access: { accountId, epoch }, children }: { access: DeviceAccess; children: ReactNode }) {
  const dialogs = useActionableDialog();
  const [state, setState] = useState<{ accountId: string; epoch: string; problem: LearningSyncProblemCode | null } | null>(null);
  const current = useRef<{ accountId: string; epoch: string; sync: DeviceLearningSync } | null>(null);
  useEffect(() => {
    const sync = createDeviceLearningSync({ accountId, epoch }, problem => setState({ accountId, epoch, problem }));
    current.current = { accountId, epoch, sync };
    return () => { sync.dispose(); if (current.current?.sync === sync) current.current = null; };
  }, [accountId, epoch]);
  const flush = useCallback(() => {
    const active = current.current;
    if (!active || active.accountId !== accountId || active.epoch !== epoch) return Promise.reject(new LearningSyncError("access-ended"));
    return active.sync.flush();
  }, [accountId, epoch]);
  const problem = state?.accountId === accountId && state.epoch === epoch ? state.problem : null;
  const notification: ActionableProblem = { scope: accountId, key: `sync:${problem}`, title: "학습 기록 동기화를 확인해 주세요.",
    description: problem === "client-update-required" ? "새 버전에서 다시 열어 동기화해 주세요. 기기 학습 기록은 보관됩니다."
      : problem === "merge-limit" ? "계정에 저장할 수 있는 학습 기록 한도에 도달했습니다. 기기 기록은 보관됩니다. 지원을 요청하거나 나중에 다시 시도해 주세요."
        : "학습 기록을 동기화하지 못했습니다. 기기 기록은 보관됩니다. 다시 시도해 주세요.",
    action: { label: problem === "client-update-required" ? "새로고침" : "동기화 재시도", run: () => {
      if (problem === "client-update-required") window.location.reload();
      else void flush().catch(() => {
        if (current.current?.accountId === accountId && current.current.epoch === epoch) dialogs.show({ ...notification, explicit: true });
      });
    } } };
  useActionableProblem(!!problem, notification);
  const control = useMemo(() => ({ problem, flush }), [problem, flush]);
  return <Context.Provider value={control}>{children}</Context.Provider>;
}
