import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { FeedbackPressable } from './feedback-pressable';
import { Icon } from './ui';

/** Copies source text only. Dictionary content never enters the clipboard. */
export function SentenceCopyButton({ text, active }: { text: string; active: boolean }) {
  const [copied, setCopied] = useState(false);
  const generation = useRef(0), pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setCopied(false);
    pending.current = false;
    return () => { generation.current++; clearTimeout(timer.current); };
  }, [text, active]);

  async function copy() {
    if (!active || pending.current) return;
    const request = generation.current;
    pending.current = true;
    clearTimeout(timer.current);
    setCopied(false);
    try {
      const success = await setStringAsync(text);
      if (request !== generation.current) return;
      if (!success) throw Error('clipboard-unavailable');
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      if (request === generation.current) Alert.alert('문장을 복사하지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (request === generation.current) pending.current = false;
    }
  }

  return <FeedbackPressable accessibilityRole="button" accessibilityLabel={copied ? '문장 복사 완료' : '문장 복사'}
    accessibilityState={{ disabled: !active }} disabled={!active} onPress={copy}
    style={({ pressed }) => ({ minWidth: 44, minHeight: 44, padding: 10, alignSelf: 'stretch',
      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
    <Icon name={copied ? 'checkmark' : 'doc.on.doc'} size={20} />
  </FeedbackPressable>;
}
