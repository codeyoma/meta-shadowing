import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LearningPackage } from '@/core/learning-context';
import { readPackageStorage, removePackageMaterials } from '@/native/package-storage';

export function usePackageMaterials(pack: LearningPackage, editing: boolean, onLocallyRemoved: () => void) {
  const [storage, setStorage] = useState<{ bytes: number; installed: boolean; busy: boolean } | null>(null);
  const [reading, setReading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cacheRetry, setCacheRetry] = useState(false);
  const refresh = useCallback(async () => {
    setReading(true);
    try {
      const current = await readPackageStorage(pack);
      setStorage(current); setReadFailed(false);
      if (current.installed) setCacheRetry(false);
      return current;
    }
    catch { setStorage(null); setReadFailed(true); return null; }
    finally { setReading(false); }
  }, [pack]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { if (editing) void refresh(); }, [editing, refresh]);
  async function remove() {
    if (removing || reading || readFailed || !storage || storage.busy) return;
    const cacheOnly = !storage.installed && storage.bytes === 0;
    setRemoving(true);
    setStorage(null);
    try {
      const result = await removePackageMaterials(pack);
      onLocallyRemoved();
      setStorage({ bytes: 0, installed: false, busy: false });
      setReadFailed(false);
      setCacheRetry(!result.cacheCleared);
      if (!result.cacheCleared) Alert.alert(cacheOnly ? 'Apple 캐시 정리가 완료되지 않았어요' : '로컬 학습 자료는 삭제했어요',
        'Apple 다운로드 캐시는 아직 정리하지 못했어요. 편집에서 캐시 정리를 다시 시도해 주세요.');
    } catch {
      setReadFailed(true);
      await refresh();
      Alert.alert(cacheOnly ? 'Apple 캐시 정리를 요청하지 못했어요' : '학습 자료를 삭제하지 못했어요',
        '다운로드 또는 파일 확인이 끝난 뒤 다시 시도해 주세요.');
    } finally { setRemoving(false); }
  }
  return { storage, reading, readFailed, removing, cacheRetry, refresh, remove };
}
