import { useState } from 'react';
import { Alert } from 'react-native';
import type { LearningPackage } from '@/core/learning-context';
import { deleteMaterials, packageAvailability } from '@/native/package-availability';
import { usePackageAvailability } from './use-package-availability';
import { materialRemovalNotice } from '@/core/library-presentation';

export function usePackageMaterials(pack: LearningPackage, editing: boolean, onLocallyRemoved: () => void) {
  const { storage, reading, failed: readFailed, changing, delivery } = usePackageAvailability(pack);
  const [removing, setRemoving] = useState(false);
  const refresh = packageAvailability(pack).refresh;
  async function remove() {
    if (removing || changing || reading || readFailed || !storage || storage.busy) return;
    setRemoving(true);
    try {
      // Native removal still attempts Apple's cache purge after deleting local materials.
      // A cache-purge failure does not undo successful local removal.
      const result = await deleteMaterials(pack);
      onLocallyRemoved();
      const notice = materialRemovalNotice(result);
      if (notice) Alert.alert('임시 파일 정리 필요', notice);
    } catch {
      Alert.alert('학습 자료를 삭제하지 못했어요',
        '다운로드 또는 파일 확인이 끝난 뒤 다시 시도해 주세요.');
    } finally { setRemoving(false); }
  }
  return { storage, reading, readFailed, removing, changing, delivery, refresh, remove };
}
