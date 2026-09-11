"use client";

import { useState } from "react";
import { useActionableProblem } from "./actionable-dialog";
import { Button } from "@/components/ui/button";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { setAudioCacheAccount } from "@/lib/mp3-cache";
import { clearDeviceAccess } from "@/lib/device-access";
import { readSupabasePublicEnvironment } from "@/lib/supabase/config";

function expireLocalAuthCookies() {
  const environment = readSupabasePublicEnvironment();
  if (!environment) return;
  const prefix = `sb-${new URL(environment.url).hostname.split(".")[0]}-auth-token`;
  for (const item of document.cookie.split(";")) {
    const name = item.trim().split("=")[0];
    if (name === prefix || (name.startsWith(`${prefix}.`) && /^\d+$/.test(name.slice(prefix.length + 1)))) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
}

export function LearnerSignOut({ settingsRow = false }: { settingsRow?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      // Capture the existing online SDK session before expiring its cookies.
      // Local invalidation must also succeed when its remote revocation fails.
      let client: ReturnType<typeof getBrowserSupabaseClient> = null;
      try { if (navigator.onLine) client = getBrowserSupabaseClient(); } catch { /* Local logout still proceeds. */ }
      try { clearDeviceAccess(); }
      finally { expireLocalAuthCookies(); setAudioCacheAccount(null); }
      if (!navigator.onLine) {
        window.location.replace("/offline");
        return;
      }
      try { await client?.auth.signOut({ scope: "local" }); }
      catch { /* Remote revocation is best effort; no credentials remain locally. */ }
      finally { expireLocalAuthCookies(); }
      // Revoke in-memory audio handles even before a navigation completes.
      // The auth subscription clears the old account's visible learning state.
      setAudioCacheAccount(null);
      window.location.replace("/login");
    } catch { setFailed(true); setBusy(false); }
  }
  useActionableProblem(failed, { scope: "sign-out", key: "failure", title: "로그아웃하지 못했습니다.", description: "기기 저장 공간을 확인한 뒤 다시 시도해 주세요.", action: { label: "로그아웃 재시도", run: () => void signOut() } });
  return <>
    <Button variant={settingsRow ? "choice" : "outline"} size={settingsRow ? "row" : "default"} className={settingsRow ? "w-full text-[var(--accent-cardinal)]" : undefined} disabled={busy} onClick={() => void signOut()}>{busy ? "로그아웃 중…" : "로그아웃"}</Button>
  </>;
}
