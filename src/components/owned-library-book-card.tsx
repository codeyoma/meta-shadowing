import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import type { SFSymbol } from 'sf-symbols-typescript';
import { canRetryStorageRead, materialActions, materialCardAction, type DownloadPresentation } from '@/core/library-presentation';
import Animated, { FadeIn, LayoutAnimationConfig, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { LibraryDownloadAction } from './library-download-action';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Card, Icon, Label, ProgressTrack, usePalette } from './ui';
import { BookTags } from './book-tags';

function IconControl({ title, icon, disabled, checking = false, tone = 'primary', onPress }: {
  title: string; icon: SFSymbol; disabled: boolean; checking?: boolean; tone?: 'primary' | 'plain' | 'cardinal'; onPress(): void;
}) {
  const c = usePalette();
  const reduced = useReducedMotion();
  const ink = disabled ? c.secondary : tone === 'plain' ? c.heading : tone === 'cardinal' ? '#1b1b1b' : c.onAccent;
  return <Animated.View style={{ borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: tone === 'plain' ? 'transparent' : disabled ? c.disabled : tone === 'cardinal' ? c.red : c.accent,
    transitionProperty: 'backgroundColor', transitionDuration: reduced ? 0 : 180 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled: disabled || checking }} disabled={disabled || checking} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 64, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 14, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      opacity: pressed ? 0.65 : 1 })}>
      <LayoutAnimationConfig skipEntering>
        <Animated.View key={title} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name={icon} size={21} color={ink} />
          <Label size={16} weight="700" color={ink}>{title}</Label>
        </Animated.View>
      </LayoutAnimationConfig>
    </Pressable>
  </Animated.View>;
}

export function OwnedLibraryBookCard({ title, sentences, chapters, completed, editing, installed, busy,
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
  return <View style={{ gap: 10 }}>
    <Card style={{ padding: 14, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 70, alignSelf: 'stretch', borderRadius: 12, overflow: 'hidden' }}>
          <Image source={require('../../assets/illustrations/morning-notes.png')} accessible={false}
            contentFit="cover" style={{ position: 'absolute', inset: 0 }} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <BookTags sentences={sentences} />
          <Label size={19} display color={c.heading}>{title}</Label>
          <Label size={13} muted>총 {sentences}문장 / 챕터 {chapters === null ? '—' : chapters + '개'}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}><ProgressTrack label="도서 스테이지 진행" value={completed ?? 0} total={16} height={8} /></View>
            <Label size={12} weight="700" color={c.heading}>{completed ?? '—'}/16</Label>
          </View>
        </View>
      </View>
      <LibraryDownloadAction download={download} onCancel={onCancel}>
        {refreshing && !storage && !storageFailed
        ? <View style={{ minHeight: 54 }} accessible accessibilityLabel="학습 자료 확인 중" />
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
    </Card>
  </View>;
}
