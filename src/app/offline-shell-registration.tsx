"use client";
import { useEffect } from "react";
import { useActionableDialog } from "./actionable-dialog";

/** Called only by download/start actions, never by connectivity changes. */
export function requestOfflineReadiness() {
  window.dispatchEvent(new Event("offline-readiness-requested"));
}

export function OfflineShellRegistration() {
  const dialogs = useActionableDialog();
  useEffect(() => {
    let alive = true, preparing: Promise<boolean> | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const prepare = (): Promise<boolean> => {
      if (preparing) return preparing;
      preparing = (async () => {
        if (!("serviceWorker" in navigator)) return false;
        if (!navigator.onLine) return !!navigator.serviceWorker.controller;
        try {
          const registration = await navigator.serviceWorker.register(`/sw.js?build=${process.env.NEXT_PUBLIC_OFFLINE_BUILD}`, { scope: "/", updateViaCache: "none" });
          if (registration.active) return true;
          const worker = registration.installing ?? registration.waiting;
          if (!worker) return false;
          return await new Promise<boolean>(resolve => {
            const finish = (ready: boolean) => { clearTimeout(timeout); worker.removeEventListener("statechange", changed); resolve(ready); };
            const changed = () => { if (worker.state === "activated") finish(true); else if (worker.state === "redundant") finish(false); };
            const timeout = setTimeout(() => finish(false), 10_000);
            worker.addEventListener("statechange", changed); changed();
          });
        } catch { return false; }
      })().finally(() => { preparing = null; });
      return preparing;
    };
    const background = () => { void prepare().then(ready => {
      if (!alive) return;
      if (ready) dialogs.resolve("shell", "offline-readiness");
      else { clearTimeout(retry); retry = setTimeout(background, 30_000); }
    }); };
    const requested = () => { void prepare().then(ready => {
      if (!alive || ready) return;
      dialogs.show({ scope: "shell", key: "offline-readiness", explicit: true, title: "오프라인 화면을 준비하지 못했습니다.",
        description: "현재 학습은 계속할 수 있습니다. 연결과 저장 공간을 확인한 뒤 다시 준비해 주세요. 준비 전에는 오프라인에서 새로 열 수 없습니다.",
        action: { label: "오프라인 화면 다시 준비", run: requested } });
    }); };
    background(); window.addEventListener("online", background); window.addEventListener("offline-readiness-requested", requested);
    return () => { alive = false; clearTimeout(retry); window.removeEventListener("online", background); window.removeEventListener("offline-readiness-requested", requested); dialogs.resolve("shell", "offline-readiness"); };
  }, [dialogs]);
  return null;
}
