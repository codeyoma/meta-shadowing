import { createContext, use, useEffect, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';
import { getProgressSync, startProgressSync } from '@/native/progress-sync';
import { usePathname } from 'expo-router';

const Context = createContext({ id: 'guest', authority: 0, available: false, suppressEntry: false });
export function ProgressProfile({ children }: PropsWithChildren) {
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const path = usePathname();
  const identity = `${state.profile}:${state.authority}`;
  const previous = useRef(identity);
  const suppress = useRef(false);
  if (previous.current !== identity) { previous.current = identity; suppress.current = path.startsWith('/player'); }
  if (!path.startsWith('/player')) suppress.current = false;
  useEffect(startProgressSync, []);
  return <Context key={identity} value={{ id: state.profile, authority: state.authority, available: state.learningAvailable, suppressEntry: suppress.current }}>{children}</Context>;
}
export function useProgressProfile() { return use(Context); }
