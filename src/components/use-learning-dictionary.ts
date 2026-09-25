import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState } from 'react-native';
import { useNavigation } from 'expo-router';
import { LearningDictionary, type DictionaryContext } from '@/core/learning-dictionary';
import { dictionary } from '../../modules/learning-dictionary';

/** Keep the player mounted; a system sheet must not re-enter or rebuild its run. */
export function useLearningDictionary(context: () => DictionaryContext) {
  const navigation = useNavigation();
  const latest = useRef(context); latest.current = context;
  const lifetime = useRef({ active: true, epoch: 0 });
  const [, render] = useState(0);
  const [controller] = useState(() => dictionary ? new LearningDictionary(dictionary, () => {
    const current = latest.current();
    return { ...current, scope: `${current.scope}:${lifetime.current.epoch}`,
      allowed: current.allowed && lifetime.current.active && AppState.currentState === 'active' && navigation.isFocused() };
  }, () => { if (lifetime.current.active) render(value => value + 1); }) : null);
  const scope = `${context().scope}:${lifetime.current.epoch}`;
  const cancel = () => { void controller?.cancel().catch(() => {}); };
  const isCurrent = () => lifetime.current.active && AppState.currentState === 'active' && navigation.isFocused()
    && `${latest.current().scope}:${lifetime.current.epoch}` === scope && latest.current().allowed;
  useEffect(() => {
    lifetime.current.active = true;
    const invalidate = () => { lifetime.current.epoch++; cancel(); render(value => value + 1); };
    const app = AppState.addEventListener('change', state => { if (state !== 'active') invalidate(); });
    const blur = navigation.addListener('blur', invalidate);
    const remove = navigation.addListener('beforeRemove', invalidate);
    return () => { lifetime.current.active = false; lifetime.current.epoch++; cancel(); app.remove(); blur(); remove(); };
  }, [controller, navigation]);
  const current = context();
  useEffect(() => { if (!current.allowed) cancel(); }, [current.allowed]);
  useEffect(() => () => { cancel(); }, [current.scope]);
  return { blocked: !!controller?.blocked, isBlocked: () => !!controller?.blocked, cancel,
    lookup: controller ? async (term: string, focus: number | null) => {
      try { await controller.lookup(scope, term); }
      catch {
        if (isCurrent())
          Alert.alert('사전을 열 수 없어요', '다시 눌러 주세요. 사전은 설정 > 일반 > 사전에서 추가할 수 있어요.');
      }
      if (focus !== null && isCurrent() && !controller.blocked)
        AccessibilityInfo.setAccessibilityFocus(focus);
    } : undefined };
}
