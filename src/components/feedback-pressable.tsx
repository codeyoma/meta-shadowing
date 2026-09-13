import { Pressable, type PressableProps } from 'react-native';
import { usePathname } from 'expo-router';
import { tapFeedback } from '@/native/tap-feedback';
import { allowsTapFeedback } from '@/core/tap-feedback';

export function FeedbackPressable({ feedback = true, onPress, disabled, accessibilityState, ...props }:
  PressableProps & { feedback?: boolean }) {
  const pathname = usePathname();
  return <Pressable {...props} disabled={disabled} accessibilityState={accessibilityState} onPress={event => {
    if (disabled || accessibilityState?.disabled || !onPress) return;
    tapFeedback(allowsTapFeedback(pathname, feedback));
    onPress(event);
  }} />;
}
