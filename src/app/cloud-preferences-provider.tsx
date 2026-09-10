"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNavigation } from "./bottom-navigation";
import { Brand, Page } from "./ui";
import { Separator } from "@/components/ui/separator";
import browseStyles from "./browse.module.css";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { PreferenceChanges, PreferencePatch, PreferenceSnapshot } from "@/lib/learner-preferences";
import type { CloudJournal } from "@/lib/cloud-practice";
import { useDeviceSettings } from "./device-settings-provider";
import { clearDeviceAccess } from "@/lib/device-access";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type CloudPreferences = PreferenceSnapshot & {
  journal: CloudJournal;
  refresh: () => Promise<void>;
  save: (changes: PreferenceChanges, revision?: number) => void;
  saving: boolean;
  loading: boolean;
  refreshing: boolean;
  refreshError: boolean;
  gate: ReactNode;
  visitRoute: (route: string) => boolean;
};
const Context = createContext<CloudPreferences | null>(null);
export function useCloudPreferences() { return useContext(Context); }

export function CloudPreferencesProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const { invalidateAccount } = useDeviceSettings();
  const pathname = usePathname();
  const params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const latestRoute = useRef(route);
  latestRoute.current = route;
  const [readyRoute, setReadyRoute] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PreferenceSnapshot | null>(null);
  const [journal, setJournal] = useState<CloudJournal | null>(null);
  const current = useRef<PreferenceSnapshot | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "error" | "account-changed">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pending = useRef<PreferencePatch | null>(null);
  const saving = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  // A refocus must never replay an old URL's selection over a newer server choice.
  const lastRoute = useRef<string | null>(null);
  const visitRoute = useCallback((route: string) => {
    if (lastRoute.current === route) return false;
    lastRoute.current = route;
    return true;
  }, []);
  const accept = useCallback((value: PreferenceSnapshot) => { current.current = value; setSnapshot(value); }, []);
  const clearAccount = useCallback(() => {
    clearDeviceAccess();
    invalidateAccount();
    generation.current += 1;
    inFlight.current = null;
    current.current = null;
    pending.current = null;
    saving.current = false;
    setSnapshot(null);
    setJournal(null);
    setSaveState("idle");
    setLoad("account-changed");
  }, [invalidateAccount]);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    // Never race a confirmed settings write with an older read.
    if (saving.current) return Promise.resolve();
    const request = (async () => {
      const token = ++generation.current;
      current.current = null;
      // The last confirmed account snapshot stays visible during revalidation.
      setLoad("loading");
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const [response, journalResponse] = await Promise.all([
          fetch(`/api/learner/preferences?timezone=${encodeURIComponent(timezone)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }),
          fetch("/api/learner/practice", { cache: "no-store", signal: AbortSignal.timeout(15000) }),
        ]);
        if (token !== generation.current) return;
        if (response.status === 401 || journalResponse.status === 401) { clearAccount(); return; }
        if (!response.ok || !journalResponse.ok) throw new Error("load-failed");
        const value: PreferenceSnapshot = await response.json();
        const accountJournal: CloudJournal = await journalResponse.json();
        if (token !== generation.current) return;
        if (value.profile.accountId !== accountId || accountJournal.accountId !== accountId) { clearAccount(); return; }
        setJournal(accountJournal);
        accept(value);
        saving.current = false;
        setSaveState(pending.current ? "error" : "idle");
        setReadyRoute(latestRoute.current);
        setLoad("ready");
      } catch {
        if (token === generation.current) { saving.current = false; setLoad("error"); }
      }
    })();
    inFlight.current = request;
    void request.finally(() => {
      if (inFlight.current === request) inFlight.current = null;
    });
    return request;
  }, [accountId, accept, clearAccount]);

  const submit = useCallback(async (patch: PreferencePatch) => {
    if (!current.current || saving.current) return;
    saving.current = true;
    pending.current = patch;
    setSaveState("saving");
    const token = generation.current;
    try {
      const response = await fetch("/api/learner/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), signal: AbortSignal.timeout(15000),
      });
      const value = await response.json();
      if (token !== generation.current) return;
      if (response.status === 401 || value.error === "account-changed") { clearAccount(); return; }
      if (!response.ok && !(response.status === 409 && value.profile?.conflict)) throw new Error("save-failed");
      if (value.profile.accountId !== accountId) { clearAccount(); return; }
      accept(value);
      pending.current = null;
      setSaveState(response.status === 409 ? "conflict" : "saved");
    } catch {
      if (token === generation.current) setSaveState("error");
    } finally {
      if (token === generation.current) saving.current = false;
    }
  }, [accountId, accept, clearAccount]);
  const save = useCallback((changes: PreferenceChanges, revision?: number) => {
    const profile = current.current?.profile;
    if (profile) void submit({ accountId: profile.accountId, revision: revision ?? profile.revision, changes });
  }, [submit]);

  useEffect(() => {
    // A route crossed during a write is refreshed after that write settles.
    if (readyRoute !== route) void refresh();
  }, [refresh, route, readyRoute, saveState]);

  useEffect(() => {
    const focus = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === "visible") focus(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    const subscription = getBrowserSupabaseClient()?.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event !== "INITIAL_SESSION" && session?.user.id !== accountId) clearAccount();
    }).data.subscription;
    return () => {
      generation.current += 1;
      inFlight.current = null;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      subscription?.unsubscribe();
    };
  }, [accountId, clearAccount, refresh]);

  const loading = !snapshot || !journal;
  const gate = load === "ready" || (load === "loading" && !loading) ? null : <div aria-busy={load === "loading"}>
    {load === "loading" ? null : <Alert aria-label="계정 설정 알림">
      <AlertTitle>{load === "account-changed" ? "로그인 계정이 변경되었습니다." : "계정 설정을 불러오지 못했습니다."}</AlertTitle>
      <AlertDescription>이전 기기의 설정으로 대체하지 않습니다.</AlertDescription>
      <Button variant="outline" onClick={() => load === "account-changed" ? window.location.replace("/settings/session") : void refresh()}>
        {load === "account-changed" ? "새 계정 불러오기" : "다시 불러오기"}
      </Button>
    </Alert>}
  </div>;
  if (!snapshot || !journal) return <Page className={browseStyles.page}>
    <header className="flex flex-col gap-5 py-5"><Brand compact /><Separator /></header>
    <div className="flex flex-1 flex-col gap-5 py-5" aria-busy={load === "loading"}>
      {load === "loading" ? <div aria-label="화면 준비" className="flex flex-col gap-5">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div> : gate}
    </div>
    <BottomNavigation active={pathname.startsWith("/settings") ? "settings" : pathname.endsWith("/stages") ? "stages" : pathname === "/lessons" ? "lessons" : "languages"} />
  </Page>;
  return <Context.Provider value={{ ...snapshot, journal, refresh, save, visitRoute, loading, refreshing: load === "loading", refreshError: load === "error", gate, saving: load !== "ready" || readyRoute !== route || saveState === "saving" || saveState === "error" }}>
    {children}
    {!loading && (saveState === "error" || saveState === "conflict") ? <div className="fixed bottom-24 left-1/2 w-[min(90vw,390px)] -translate-x-1/2">
      {saveState === "error" || saveState === "conflict" ? <Alert aria-label="계정 설정 알림">
        <AlertTitle>{saveState === "error" ? "저장을 확인하지 못했습니다." : "다른 기기에서 설정이 변경되었습니다."}</AlertTitle>
        <AlertDescription>{saveState === "error" ? "변경은 이 화면에만 남아 있습니다. 연결을 확인하고 재시도해 주세요. 화면을 닫으면 마지막 서버 확인 설정으로 돌아갑니다." : "최신 설정을 표시했습니다. 원하는 값을 다시 선택해 주세요."}</AlertDescription>
        {saveState === "error" ? <>
          <Button variant="outline" onClick={() => pending.current && void submit(pending.current)}>저장 재시도</Button>
          <Button variant="ghost" onClick={() => { pending.current = null; void refresh(); }}>변경 취소</Button>
        </> : null}
      </Alert> : null}
    </div> : null}
  </Context.Provider>;
}
