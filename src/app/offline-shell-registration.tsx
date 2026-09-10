"use client";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function OfflineShellRegistration() {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!("serviceWorker" in navigator)) { setFailed(true); return; }
    if (!navigator.onLine && navigator.serviceWorker.controller) return;
    void navigator.serviceWorker.register(`/sw.js?build=${process.env.NEXT_PUBLIC_OFFLINE_BUILD}`, { scope: "/", updateViaCache: "none" }).then(registration => {
      const worker = registration.installing;
      if (worker) worker.addEventListener("statechange", () => {
        if (alive && worker.state === "redundant" && !registration.active) setFailed(true);
      });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt]);
  if (!failed) return null;
  return <Alert aria-label="오프라인 준비 알림"><AlertTitle>오프라인 화면을 준비하지 못했습니다.</AlertTitle>
    <AlertDescription>현재 기기 학습은 계속할 수 있습니다. 오프라인에서 새로고침하려면 연결과 저장 공간을 확인한 뒤 다시 준비해 주세요.</AlertDescription>
    <Button variant="outline" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>오프라인 화면 다시 준비</Button>
  </Alert>;
}
