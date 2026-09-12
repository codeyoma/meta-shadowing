import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getJournal } from '@/native/journal';
import { packageKey, lesson } from '@/native/package';
import { stageOverview, type StageRecord } from '@/core/stage-overview';

export function useBookRecords() {
  const [records, setRecords] = useState<StageRecord[] | null>(null);
  useFocusEffect(useCallback(() => {
    try {
      const journal = getJournal();
      setRecords(Array.from({ length: 16 }, (_, i) => {
        const stage = i + 1;
        return { stage, count: stage === 1 || stage === 2 ? journal.completions(packageKey, stage) : 0,
          session: stage === 1 || stage === 2 ? journal.load(packageKey, stage, lesson.phrases.length) : null };
      }));
    } catch {
      setRecords(null);
      Alert.alert('학습 기록을 열 수 없어요', '기록을 초기화하지 않았어요. 앱을 다시 열어 확인해 주세요.');
    }
  }, []));
  return { records, overview: records ? stageOverview(records) : null };
}
