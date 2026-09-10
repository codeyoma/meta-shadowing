"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readDeviceAccess, subscribeDeviceAccess, verifyDeviceAccess, type DeviceAccess } from "@/lib/device-access";

const Context = createContext<DeviceAccess | null>(null);
export const useDeviceAccess = () => useContext(Context);

export function DeviceAccessProvider({ accountId, children, offline = false }: { accountId?: string; children: ReactNode; offline?: boolean }) {
  const [access, setAccess] = useState<DeviceAccess | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const accept = (value: DeviceAccess | null) => {
      if (alive) {
        const next = value && (!accountId || value.accountId === accountId) ? value : null;
        setAccess(previous => previous?.epoch === next?.epoch ? previous : next); setLoaded(true);
      }
    };
    const read = () => { try { accept(readDeviceAccess()); } catch { setError(true); setLoaded(true); } };
    const verify = () => { void verifyDeviceAccess(accountId).then(accept).catch(() => { if (alive) { setError(true); setLoaded(true); } }); };
    read();
    // A fresh empty offline browser may never bootstrap itself from package presence.
    if (!offline || navigator.onLine) verify();
    const unsubscribe = subscribeDeviceAccess(read);
    window.addEventListener("online", verify); window.addEventListener("focus", verify);
    return () => { alive = false; unsubscribe(); window.removeEventListener("online", verify); window.removeEventListener("focus", verify); };
  }, [accountId, offline, attempt]);
  if (access && !error) return <Context.Provider key={`${access.accountId}:${access.epoch}`} value={access}>{children}</Context.Provider>;
  return <main className="page mx-auto flex w-full max-w-md flex-col gap-4 p-5">
    <h1>Meta Shadowing</h1>
    {!loaded ? <p role="status">기기 계정을 확인하고 있어요…</p> : <Alert>
      <AlertTitle>{error ? "기기 계정 저장 공간을 확인해 주세요." : "온라인 로그인이 필요합니다."}</AlertTitle>
      <AlertDescription>이전에 로그인한 계정만 이 기기에서 오프라인 학습을 할 수 있습니다. 로그아웃하면 기기 학습 접근이 종료됩니다.</AlertDescription>
      <Button variant="outline" onClick={() => { setError(false); setAttempt(value => value + 1); }}>다시 확인</Button>
      <Button asChild variant="outline"><a href="/login">로그인</a></Button>
    </Alert>}
  </main>;
}
