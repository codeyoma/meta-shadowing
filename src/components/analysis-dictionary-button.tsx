import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { dictionary } from '@/../modules/learning-dictionary';
import { FeedbackPressable } from './feedback-pressable';
import { Icon, Label, usePalette } from './ui';
import { useSettingsColors } from './settings-row';

let nextRequest = 0;

/** Own only this reference drawer; never resume playback or change learning progress. */
export function AnalysisDictionaryButton({ term }: { term: string }) {
  const c = usePalette(), settings = useSettingsColors();
  const request = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eligible = useMemo(() => {
    const ranges = dictionary?.words(term) ?? [];
    return ranges.length === 1 && ranges[0]!.start === 0 && ranges[0]!.end === term.length;
  }, [term]);
  useEffect(() => () => {
    const id = request.current;
    request.current = null;
    if (id) void dictionary?.dismiss(id).catch(() => {});
  }, []);

  async function open() {
    if (!dictionary || !eligible || request.current) return;
    const id = `analysis-${++nextRequest}`;
    request.current = id;
    setBusy(true);
    try {
      await dictionary.present(id, term);
    } catch {
      if (request.current === id) Alert.alert('사전을 열지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (request.current === id) { request.current = null; setBusy(false); }
    }
  }

  if (!dictionary) return <Label muted>이 기기에서는 사전을 사용할 수 없어요.</Label>;
  if (!eligible) return null;
  return <FeedbackPressable accessibilityRole="button" accessibilityLabel={`사전 보기: ${term}`}
    accessibilityState={{ disabled: busy }} disabled={busy} onPress={open}
    style={({ pressed }) => ({ minHeight: 52, padding: 16, borderRadius: 16, borderCurve: 'continuous',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: pressed ? settings.pressed : settings.group, opacity: busy ? 0.5 : 1 })}>
    <Icon name="book" size={20} color={c.link} />
    <Label color={c.link} weight="700">사전 보기</Label>
  </FeedbackPressable>;
}
