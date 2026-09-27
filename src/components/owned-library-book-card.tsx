import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import type { SFSymbol } from 'sf-symbols-typescript';
import { canRetryStorageRead, materialActions, materialCardAction, type DownloadPresentation } from '@/core/library-presentation';
import Animated, { FadeIn, LayoutAnimationConfig, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { LibraryDownloadAction } from './library-download-action';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Card, Icon, Label, ProgressTrack, usePalette } from './ui';
import { BookTags } from './book-tags';
import { LibraryGridTitle } from './library-grid';

function IconControl({ title, icon, disabled, checking = false, tone = 'primary', onPress }: {
  title: string; icon: SFSymbol; disabled: boolean; checking?: boolean; tone?: 'primary' | 'plain' | 'cardinal'; onPress(): void;
}) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const ink = disabled ? c.secondary : tone === 'plain' ? c.heading : tone === 'cardinal' ? '#1b1b1b' : c.onAccent;
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled: disabled || checking }} disabled={disabled || checking} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 64, minHeight: 44, justifyContent: 'flex-end',
      opacity: pressed ? 0.65 : 1 })}>
    <Animated.View pointerEvents="none" style={{ minHeight: 32, paddingHorizontal: 12, paddingVertical: 2,
      borderRadius: 10, borderCurve: 'continuous', justifyContent: 'center',
      backgroundColor: tone === 'plain' ? 'transparent' : disabled ? c.disabled : tone === 'cardinal' ? c.red : c.accent,
      transitionProperty: 'backgroundColor', transitionDuration: reduced ? 0 : 180 }}>
      <LayoutAnimationConfig skipEntering>
        <Animated.View key={title} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          pointerEvents="none" style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            // Optically balance the download symbol's bottom-heavy outline with the filled play icon.
            transform: [{ translateY: icon === 'square.and.arrow.down' ? -2 : 0 }] }}>
          <Icon name={icon} size={16} color={ink} />
        </Animated.View>
      </LayoutAnimationConfig>
    </Animated.View>
  </Pressable>;
}

export function OwnedLibraryBookCard({ title, sentences, completed, editing, installed, busy,
  storage, storageFailed, download, onStudy, onDownload, onCancel, onRemove, onRetryStorage, accessBlocked = false, refreshing = false }: {
  title: string; sentences: number; chapters: number | null; completed: number | null; editing: boolean;
  installed: boolean; busy: boolean;
  accessBlocked?: boolean;
  refreshing?: boolean;
  storage: { bytes: number; installed: boolean; busy: boolean } | null; storageFailed: boolean;
  download?: DownloadPresentation | null; onStudy(): void; onDownload(): void; onCancel?(): void; onRemove(): void;
  onRetryStorage(): void;
}) {
  const c = usePalette();
  const verifiedInstalled = storageFailed ? false : storage?.installed ?? installed;
  const actions = materialActions({ installed: verifiedInstalled, busy: busy || !!storage?.busy,
    editing, bytes: storage?.bytes, readFailed: storageFailed });
  const action = materialCardAction({ installed: verifiedInstalled, editing, readFailed: storageFailed });
  return <View style={{ flex: 1 }}>
    <Card style={{ flex: 1, padding: 0, gap: 0, overflow: 'hidden' }}>
      <View>
        <Image source={require('../../assets/illustrations/morning-notes.png')} accessible={false}
          contentFit="cover" style={{ width: '100%', aspectRatio: 3 / 4 }} />
        <BookTags sentences={sentences} overlay />
      </View>
      <View style={{ flex: 1, padding: 12, gap: 6 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <LibraryGridTitle><Label size={18} display color={c.heading}>{title}</Label></LibraryGridTitle>
          <Label size={12} muted>총 {sentences}문장</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}><ProgressTrack label="도서 스테이지 진행" value={completed ?? 0} total={16} height={8} /></View>
            <Label size={12} weight="700" color={c.heading}>{completed ?? '—'}/16</Label>
          </View>
        </View>
        <LibraryDownloadAction download={download} onCancel={onCancel}>
        {refreshing && !storage && !storageFailed
        ? <View style={{ minHeight: 44 }} accessible accessibilityLabel="학습 자료 확인 중" />
        : action === 'retry'
        ? <IconControl title="다시 확인" icon="arrow.clockwise" tone="plain"
          checking={refreshing}
          disabled={!!download || !canRetryStorageRead(storageFailed, busy || !!storage?.busy)} onPress={onRetryStorage} />
        : action === 'remove'
        ? <IconControl title="학습 자료 삭제" icon="trash" tone="cardinal" checking={refreshing} disabled={!!download || !actions.canRemove} onPress={() => Alert.alert(
          '"' + title + '" 학습 자료를 삭제할까요?',
          '다운로드한 자료만 삭제하며, 학습 기록은 유지돼요.', [
            { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: onRemove },
          ])} />
        : action === 'study'
        ? <IconControl title="학습하기" icon="play.fill" checking={refreshing} disabled={accessBlocked || !actions.canStudy} onPress={onStudy} />
        : <IconControl title="다운로드" icon="square.and.arrow.down" tone="plain"
          checking={refreshing}
          disabled={accessBlocked || !actions.canDownload || !!download} onPress={onDownload} />}
        </LibraryDownloadAction>
      </View>
    </Card>
  </View>;
}
