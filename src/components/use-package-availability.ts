import { useSyncExternalStore } from 'react';
import type { LearningPackage } from '@/core/learning-context';
import { packageAvailability } from '@/native/package-availability';
import type { MaterialSnapshot } from '@/core/package-availability';

const empty: MaterialSnapshot = { storage: null, delivery: null, reading: false, changing: false, failed: false };
const noPackage = { getSnapshot: () => empty, subscribe: () => () => {} };
export function usePackageAvailability(pack: LearningPackage | null) {
  const entry = pack ? packageAvailability(pack) : noPackage;
  return useSyncExternalStore(entry.subscribe, entry.getSnapshot);
}
