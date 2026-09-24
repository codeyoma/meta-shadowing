import { useCallback, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LearningPackage } from '@/core/learning-context';
import { PaidLearningAccess } from '@/core/paid-learning-access';
import { isPaidDuo, paidAccess, paidAccessSource, mayUsePackage } from '@/native/paid-package';
import { isInstalled } from '@/native/package';
import { usePackageAvailability } from './use-package-availability';

/** Browsing subscribes to shared state; it never performs focus-driven I/O. */
export function usePackageLearningStatus(pack: LearningPackage | null) {
  const { storage, reading, changing, failed, delivery } = usePackageAvailability(pack);
  const access = useSyncExternalStore(paidAccess.subscribe, paidAccess.getSnapshot);
  const permitted = !!pack && (!isPaidDuo(pack) || access.allowed);
  const ready = failed ? false : storage?.installed ?? null;
  const deliveryBusy = !!delivery && ['downloading', 'installing', 'cancelling'].includes(delivery.phase);
  const checking = reading || changing || deliveryBusy || !!storage?.busy;
  return { ready, checking, allowed: ready === true && !checking && permitted };
}

/** Direct information/options routes still verify before exposing source text. */
export function usePackageLearningAccess(pack: LearningPackage | null) {
  const [result, setResult] = useState<{ pack: LearningPackage | null; ready: boolean | null; checking: boolean }>(
    { pack, ready: null, checking: true });
  useFocusEffect(useCallback(() => {
    let active=true, generation=0;
    const invalidate = () => {
      generation++;
      if (active) setResult({ pack, ready: false, checking: false });
    };
    const checking = () => setResult(previous => ({ pack,
      ready: previous.pack === pack ? previous.ready : null, checking: true }));
    const guard=pack && isPaidDuo(pack) ? new PaidLearningAccess(paidAccessSource, invalidate) : null;
    const refresh=async () => {
      const epoch=++generation;
      checking();
      try {
        const ready = !!pack && (!guard || await guard.enter()) && await isInstalled(pack)
          && mayUsePackage(pack) && (!guard || guard.allowed());
        if (active && epoch === generation) setResult({ pack, ready, checking: false });
      } catch { if (active && epoch === generation) setResult({ pack, ready: false, checking: false }); }
    };
    void refresh();
    const subscription=AppState.addEventListener('change',state => {
      generation++; checking(); guard?.suspend(); if(state==='active') void refresh();
    });
    return () => {active=false;generation++;guard?.dispose();subscription.remove();};
  },[pack]));
  const current = result.pack === pack;
  const ready = current ? result.ready : null;
  const checking = !current || result.checking;
  return !!pack && ready === true && !checking && mayUsePackage(pack);
}
