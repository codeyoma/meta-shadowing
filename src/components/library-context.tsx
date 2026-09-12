import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from './progress-profile';
import { resolveSelection, type Selection } from '@/core/catalog';
import { books } from '@/native/catalog';
import { useStudyProgress } from './use-study-progress';

const Context = createContext<{ selection: Selection; select(value: Selection): boolean; progress: ReturnType<typeof useStudyProgress> } | null>(null);
export function LibraryProvider({ children }: PropsWithChildren) {
  const profile = useProgressProfile();
  const [selection, setSelection] = useState(() => resolveSelection(books, null));
  const progress = useStudyProgress(selection.language, selection.book);
  useEffect(() => {
    try {
      const raw = getProgressSync().profiles.readValue('selection', profile.id);
      setSelection(resolveSelection(books, raw ? JSON.parse(raw) : null));
    } catch { Alert.alert('선택한 도서를 불러오지 못했어요', '학습 기록은 유지됩니다. 저장 공간을 확인해 주세요.'); }
  }, []);
  function select(value: Selection) {
    const next = resolveSelection(books, value);
    try {
      const sync = getProgressSync();
      if (profile.id !== sync.profiles.id()) return false;
      sync.profiles.saveValue('selection', JSON.stringify(next), profile.id); sync.changed(); setSelection(next); return true;
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
