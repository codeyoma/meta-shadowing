import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { getJournal } from '@/native/journal';
import type { DailyReward, Progression } from '@/core/progression';

type Snapshot = { summary: ReturnType<Progression['summary']>; daily: DailyReward | null };
export function useStudyProgress(language: string, book: string | null) {
  const path = usePathname();
  const [snapshot, setSnapshot] = useState<{ language: string; book: string | null; data: Snapshot } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let shownError = false;
    function refresh() {
      clearTimeout(timer);
      try {
        const progress = getJournal().progress;
        setSnapshot({ language, book, data: { summary: progress.summary(language), daily: book ? progress.daily(language, book) : null } });
      } catch {
        setSnapshot(null);
        if (!shownError) { shownError = true; Alert.alert('학습 기록을 읽을 수 없어요', '앱을 다시 열어 확인해 주세요. 기록은 초기화하지 않았어요.'); }
      }
      const midnight = new Date(); midnight.setHours(24, 0, 0, 50);
      timer = setTimeout(refresh, Math.max(50, midnight.getTime() - Date.now()));
    }
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [language, book, path]);
  return snapshot?.language === language && snapshot.book === book ? snapshot.data : null;
}
