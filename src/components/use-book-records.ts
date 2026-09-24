import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getJournal } from '@/native/journal';
import { getProgressSync } from '@/native/progress-sync';
import { LearningContext, packageKeyOf, isVideoPackage, type LearningPackage } from '@/core/learning-context';
import { stageOverview, type StageRecord } from '@/core/stage-overview';
import { isPlayableStage } from '@/core/catalog';
import { testStageAccess } from '@/native/stage-access';
import { videoStageAvailable } from '@/core/video-package';

export function useBookRecords(pack: LearningPackage | null) {
  const key = pack ? packageKeyOf(pack) : null;
  const [result, setResult] = useState<{ key: string; records: StageRecord[]; latestStage: number | null } | null>(null);
  const [bypass, setBypass] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void testStageAccess().then(value => { if (active) setBypass(value); });
    if (!pack || !key) { setResult(null); return () => { active = false; }; }
    let shownError = false;
    function refresh() { try {
      if (!getProgressSync().getSnapshot().learningAvailable) { setResult(null); return; }
      const context = new LearningContext(pack!, getJournal());
      setResult({ key: key!, latestStage: context.latestStage(), records: Array.from({ length: 16 }, (_, i) => {
        const stage = i + 1;
        return { stage, count: isPlayableStage(stage) ? context.completions(stage) : 0,
          session: isPlayableStage(stage) ? context.load(stage) : null };
      }).filter(record => !isVideoPackage(pack!) || videoStageAvailable(record.stage)) });
    } catch {
      setResult(null);
      if (!shownError) { shownError = true; Alert.alert('학습 기록을 열 수 없어요', '기록을 초기화하지 않았어요. 앱을 다시 열어 확인해 주세요.'); }
    } }
    refresh();
    const unsubscribe = getProgressSync().subscribe(refresh);
    return () => { active = false; unsubscribe(); };
  }, [pack, key]));
  const records = result?.key === key ? result?.records ?? null : null;
  return { records, overview: records ? stageOverview(records, result?.latestStage, bypass) : null, bypass };
}
