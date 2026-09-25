import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { getProgressSync } from '@/native/progress-sync';
import { readSettings } from '@/native/settings';
import { decodeSettings } from '@/core/settings';

// A primitive snapshot stays stable across unrelated checkpoint/cloud events.
function snapshot(): string | null {
  try {
    return getProgressSync().getSnapshot().learningAvailable ? JSON.stringify(readSettings()) : null;
  } catch { return 'invalid'; }
}

/** Browsing, menus and the mounted player share the durable profile preference. */
export function useLearningSettings() {
  const json = useSyncExternalStore(getProgressSync().subscribe, snapshot);
  const result = useMemo(() => {
    try { return { settings: json === null ? null : decodeSettings(json), error: false }; }
    catch { return { settings: null, error: true }; }
  }, [json]);
  useEffect(() => {
    if (result.error) Alert.alert('설정을 읽을 수 없어요', '저장 공간을 확인하고 앱을 다시 열어 주세요.');
  }, [result.error]);
  return result.settings;
}
