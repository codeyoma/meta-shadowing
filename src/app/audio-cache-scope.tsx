"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { setAudioCacheAccount } from "@/lib/mp3-cache";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const Account = createContext<string | undefined>(undefined);
export function AudioCacheScope({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <Account.Provider value={accountId}>{children}</Account.Provider>;
}
export const useAudioCacheAccount = () => useContext(Account);

export function AudioCacheLifecycle() {
  useEffect(() => {
    const subscription = getBrowserSupabaseClient()?.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setAudioCacheAccount(session?.user.id ?? null);
    }).data.subscription;
    return () => subscription?.unsubscribe();
  }, []);
  return null;
}
