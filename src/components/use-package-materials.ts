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
  const refresh = useCallback(async () => {
    setReading(true);
    try {
      const current = await readPackageStorage(pack);
      setStorage(current); setReadFailed(false);
      return current;
    }
    catch { setStorage(null); setReadFailed(true); return null; }
    finally { setReading(false); }
  }, [pack]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { if (editing) void refresh(); }, [editing, refresh]);
  async function remove() {
    if (removing || reading || readFailed || !storage || storage.busy) return;
    setRemoving(true);
    setStorage(null);
    try {
      // Native removal still attempts Apple's cache purge after deleting local materials.
      // A cache-purge failure does not undo successful local removal.
      await removePackageMaterials(pack);
      onLocallyRemoved();
      setStorage({ bytes: 0, installed: false, busy: false });
      setReadFailed(false);
    } catch {
      setReadFailed(true);
      await refresh();
      Alert.alert('학습 자료를 삭제하지 못했어요',
        '다운로드 또는 파일 확인이 끝난 뒤 다시 시도해 주세요.');
    } finally { setRemoving(false); }
  }
  return { storage, reading, readFailed, removing, refresh, remove };
}
