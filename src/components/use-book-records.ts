import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getJournal } from '@/native/journal';
import { LearningContext, packageKeyOf, type LearningPackage } from '@/core/learning-context';
import { stageOverview, type StageRecord } from '@/core/stage-overview';

export function useBookRecords(pack: LearningPackage | null) {
  const key = pack ? packageKeyOf(pack) : null;
  const [result, setResult] = useState<{ key: string; records: StageRecord[] } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!pack || !key) { setResult(null); return; }
    try {
      const context = new LearningContext(pack, getJournal());
      setResult({ key, records: Array.from({ length: 16 }, (_, i) => {
        const stage = i + 1;
        return { stage, count: stage === 1 || stage === 2 ? context.completions(stage) : 0,
          session: stage === 1 || stage === 2 ? context.load(stage) : null };
      }) });
    } catch {
      setResult(null);
      Alert.alert('학습 기록을 열 수 없어요', '기록을 초기화하지 않았어요. 앱을 다시 열어 확인해 주세요.');
    }
  }, [pack, key]));
  const records = result?.key === key ? result?.records ?? null : null;
  return { records, overview: records ? stageOverview(records) : null };
}
