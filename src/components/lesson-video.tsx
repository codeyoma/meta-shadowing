import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

const NativeVideo = requireNativeView<ViewProps>('LearningAudio');
export function LessonVideo() {
  return <NativeVideo accessibilityLabel="학습 동영상" accessible={false}
    style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000', overflow: 'hidden' }} />;
}
