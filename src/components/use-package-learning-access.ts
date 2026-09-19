import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LearningPackage } from '@/core/learning-context';
import { PaidLearningAccess } from '@/core/paid-learning-access';
import { isPaidDuo, paidAccessSource, mayUsePackage } from '@/native/paid-package';
import { isInstalled } from '@/native/package';

/** Direct information/options routes must verify before exposing any source text. */
export function usePackageLearningAccess(pack:LearningPackage|null) {
  const [ready,setReady]=useState<LearningPackage|null>(null);
  useFocusEffect(useCallback(() => {
    let active=true, generation=0;
    setReady(null);
    const guard=pack && isPaidDuo(pack) ? new PaidLearningAccess(paidAccessSource, () => {generation++;setReady(null);}) : null;
    const refresh=async () => {
      const epoch=++generation;
      try {
        if(!pack || (guard && !await guard.enter()) || !await isInstalled(pack)) return;
        if(active && epoch===generation && mayUsePackage(pack) && (!guard || guard.allowed())) setReady(pack);
      } catch {if(active) setReady(null);}
    };
    void refresh();
    const subscription=AppState.addEventListener('change',state => {
      generation++;setReady(null);if(state==='active') void refresh();
    });
    return () => {active=false;generation++;guard?.dispose();subscription.remove();};
  },[pack]));
  return !!pack && ready===pack && mayUsePackage(pack);
}
