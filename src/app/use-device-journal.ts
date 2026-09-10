"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readDeviceLearningRecord, type DeviceLearningRecord } from "@/lib/device-learning-store";
import { assertDeviceAccess } from "@/lib/device-access";
import type { Journal } from "@/lib/learning-records";
import { useDeviceAccess } from "./device-access-provider";

const emptyJournal = (): Journal & { localProgress: DeviceLearningRecord["runs"] } => ({ progress: null, localProgress: [], history: [], studyDays: [] });

/** Learning records are device authoritative. Cloud records are intentionally ignored. */
export function useDeviceJournal(_cloud: Journal) {
  const access = useDeviceAccess(), pathname = usePathname();
  const [snapshot, setSnapshot] = useState<{ accountId: string; record: DeviceLearningRecord | null } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  useEffect(() => {
    if (!access) { setLoading(false); setError(false); return; }
    let alive = true;
    setLoading(true); setError(false);
    const read = () => {
      void readDeviceLearningRecord(access.accountId).then(value => {
        assertDeviceAccess(access);
        if (alive) { setSnapshot({ accountId: access.accountId, record: value }); setLoading(false); setError(false); }
      }).catch(() => { if (alive) { setError(true); setLoading(false); } });
    };
    read(); window.addEventListener("focus", read); window.addEventListener("device-learning-changed", read);
    return () => { alive = false; window.removeEventListener("focus", read); window.removeEventListener("device-learning-changed", read); };
  }, [access, pathname]);
  const record = access && snapshot?.accountId === access.accountId ? snapshot.record : null;
  return { loading: access ? loading || snapshot?.accountId !== access.accountId : false, error,
    settings: record?.settings ?? {}, preferredLevel: record?.preferredLevel ?? 1,
    journal: record ? { progress: null, localProgress: record.runs, history: record.history, studyDays: record.studyDays } : emptyJournal() };
}
