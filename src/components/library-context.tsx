import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import { usePathname } from 'expo-router';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from './progress-profile';
import { resolveSelection, type Selection } from '@/core/catalog';
import { books } from '@/native/catalog';
import { browsedLibrarySnapshot, librarySnapshot, type LibrarySnapshot } from '@/core/library-resume';
import { useStudyProgress } from './use-study-progress';

const Context = createContext<{ selection: Selection; select(value: Selection): boolean; progress: ReturnType<typeof useStudyProgress> } | null>(null);
export function LibraryProvider({ children }: PropsWithChildren) {
  const profile = useProgressProfile();
  const path = usePathname();
  const observed = useRef<LibrarySnapshot | null>(null);
  const [selection, setSelection] = useState(() => resolveSelection(books, null));
  const progress = useStudyProgress(selection.language, selection.book);
  useEffect(() => {
    const sync = getProgressSync();
    let shownError = false;
    function refresh(allowResume = false) {
      // Apply remote library selection on return, never in the active player.
      if (path.startsWith('/player') || profile.id !== sync.profiles.id()) return;
      try {
        const raw = sync.profiles.readValue('selection', profile.id);
        const next = librarySnapshot(books, observed.current, raw, sync.profiles.current().journal.latestLearning(), allowResume);
        observed.current = next;
        setSelection(previous => JSON.stringify(previous) === JSON.stringify(next.selection) ? previous : next.selection);
      } catch {
        if (!shownError) { shownError = true; Alert.alert('선택한 도서를 불러오지 못했어요', '학습 기록은 유지됩니다. 저장 공간을 확인해 주세요.'); }
      }
    }
    refresh(true);
    return sync.subscribe(refresh);
  }, [path, profile.id]);
  function select(value: Selection) {
    const next = resolveSelection(books, value);
    try {
      const sync = getProgressSync();
      if (profile.id !== sync.profiles.id()) return false;
      sync.profiles.saveValue('selection', JSON.stringify(next), profile.id);
      observed.current = browsedLibrarySnapshot(observed.current, next);
      sync.changed(); setSelection(next); return true;
    }
    catch { Alert.alert('도서를 선택하지 못했어요', '저장 공간을 확인하고 다시 시도해 주세요.'); return false; }
  }
  return <Context value={{ selection, select, progress }}>{children}</Context>;
}
export function useLibrary() {
  const context = use(Context);
  if (!context) throw Error('Library provider is unavailable.');
  return context;
}
