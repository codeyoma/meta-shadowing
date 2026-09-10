"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readDeviceLearningRecord, type DeviceLearningRecord } from "@/lib/device-learning-store";
import { assertDeviceAccess } from "@/lib/device-access";
import type { Journal } from "@/lib/learning-records";
import { useDeviceAccess } from "./device-access-provider";

/** Only level one has moved. Never import its legacy cloud records into the device. */
export function useDeviceJournal(cloud: Journal) {
  const access = useDeviceAccess(), pathname = usePathname();
  const [record, setRecord] = useState<DeviceLearningRecord | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  useEffect(() => {
    if (!access) return;
    let alive = true;
    const read = () => {
      void readDeviceLearningRecord(access.accountId).then(value => {
        assertDeviceAccess(access);
        if (alive) { setRecord(value); setLoading(false); setError(false); }
      }).catch(() => { if (alive) { setError(true); setLoading(false); } });
    };
    read(); window.addEventListener("focus", read); window.addEventListener("device-learning-changed", read);
    return () => { alive = false; window.removeEventListener("focus", read); window.removeEventListener("device-learning-changed", read); };
  }, [access, pathname]);
  if (!access) return { journal: cloud, loading: false, error: false };
  return { loading, error, journal: { ...cloud,
    progress: cloud.progress?.level === 1 ? null : cloud.progress,
    localProgress: record?.runs ?? [],
    history: [...cloud.history.filter(run => run.level !== 1), ...(record?.history ?? [])],
  } };
}
