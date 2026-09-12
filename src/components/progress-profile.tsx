import { createContext, use, useEffect, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';
import { getProgressSync, startProgressSync } from '@/native/progress-sync';
import { usePathname } from 'expo-router';

const Context = createContext({ id: 'guest', suppressEntry: false });
export function ProgressProfile({ children }: PropsWithChildren) {
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const path = usePathname();
  const previous = useRef(state.profile);
  const suppress = useRef(false);
  if (previous.current !== state.profile) { previous.current = state.profile; suppress.current = path === '/player' || path === '/player-options'; }
  if (path !== '/player' && path !== '/player-options') suppress.current = false;
  useEffect(startProgressSync, []);
  return <Context key={state.profile} value={{ id: state.profile, suppressEntry: suppress.current }}>{children}</Context>;
}
export function useProgressProfile() { return use(Context); }
