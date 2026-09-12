import { View } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { Icon, usePalette } from './ui';
import type { MainPlayerAction } from '@/core/player-presentation';

const labels: Record<MainPlayerAction, string> = { resume: '이어하기', confirm: '말했어요, 다음 사이클',
  next: '다음 문장 또는 학습 마치기', leave: '레슨으로 돌아가기', recover: '오류 복구 후 이어하기', wait: '음성 재생 중' };

function Control({ action, repeat, disabled, onPress }: { action: MainPlayerAction; repeat?: boolean; disabled: boolean; onPress(): void }) {
  const c = usePalette();
  const reduced = useReducedMotion();
  return <Pressable sound={false} accessibilityRole="button" accessibilityLabel={repeat ? '두 번 더 연습' : labels[action]}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>
    {({ pressed }) => <Animated.View style={{ minHeight: 54, padding: 12, alignItems: 'center', justifyContent: 'center',
      borderRadius: 16, backgroundColor: repeat ? c.card : c.accent, borderWidth: repeat ? 2 : 0, borderColor: c.line,
      boxShadow: `0 4px 0 ${repeat ? c.line : c.accentPressed}`, opacity: disabled ? 0.45 : 1,
      transform: [{ scale: pressed && !reduced ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: reduced ? 0 : 120 }}>
      <Icon name={repeat ? 'arrow.2.circlepath' : action === 'leave' ? 'arrow.left' : 'play.fill'}
        size={26} color={repeat ? c.heading : c.onAccent} />
    </Animated.View>}
  </Pressable>;
}

export function PlayerControls({ action, repeat, busy, onMain, onRepeat }: {
  action: MainPlayerAction; repeat: boolean; busy: boolean; onMain(): void; onRepeat(): void;
}) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>
    {repeat && <View style={{ flex: 1 }}>
      <Control action={action} repeat disabled={busy} onPress={onRepeat} />
    </View>}
    <View style={{ flex: repeat ? 3 : 1 }}>
      <Control action={action} disabled={busy || action === 'wait'} onPress={onMain} />
    </View>
  </View>;
}
