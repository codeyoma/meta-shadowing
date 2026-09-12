import { Pressable, type PressableProps } from 'react-native';
import { usePathname } from 'expo-router';
import { tapFeedback } from '@/native/tap-feedback';
import { allowsTapFeedback } from '@/core/tap-feedback';

export function FeedbackPressable({ feedback = true, sound = true, onPress, disabled, accessibilityState, ...props }:
  PressableProps & { feedback?: boolean; sound?: boolean }) {
  const pathname = usePathname();
  return <Pressable {...props} disabled={disabled} accessibilityState={accessibilityState} onPress={event => {
    if (disabled || accessibilityState?.disabled || !onPress) return;
    tapFeedback(allowsTapFeedback(pathname, feedback), sound);
    onPress(event);
  }} />;
}
