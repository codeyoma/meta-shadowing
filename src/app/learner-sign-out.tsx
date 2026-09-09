"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { setAudioCacheAccount } from "@/lib/mp3-cache";

export function LearnerSignOut({ settingsRow = false }: { settingsRow?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const client = getBrowserSupabaseClient();
      if (!client) throw new Error("auth-unavailable");
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      // Revoke in-memory audio handles even before a navigation completes.
      // The auth subscription clears the old account's visible learning state.
      setAudioCacheAccount(null);
      window.location.replace("/login");
    } catch { setFailed(true); setBusy(false); }
  }
  return <>
    <Button variant={settingsRow ? "choice" : "outline"} size={settingsRow ? "row" : "default"} className={settingsRow ? "w-full text-[var(--accent-cardinal)]" : undefined} disabled={busy} onClick={() => void signOut()}>{busy ? "로그아웃 중…" : "로그아웃"}</Button>
    {failed ? <p role="alert">로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.</p> : null}
  </>;
}
