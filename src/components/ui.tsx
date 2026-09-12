import type { PropsWithChildren } from 'react';
import { Text, View, useColorScheme, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Image } from 'expo-image';
import { isLoaded } from 'expo-font';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import type { SFSymbol } from 'sf-symbols-typescript';
import { palettes } from './theme';

export function usePalette() {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function Label({ children, size = 17, muted = false, weight = '500', color, display = false, align }: PropsWithChildren<{
  size?: number; muted?: boolean; weight?: '400' | '500' | '600' | '700' | '800';
  color?: string; display?: boolean; align?: TextStyle['textAlign'];
}>) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const rounded = display && isLoaded('Nunito_800ExtraBold');
  // Keep native measurement in sync when Dynamic Type changes with the screen open.
  return <Text selectable allowFontScaling={false} style={{ color: color ?? (muted ? c.secondary : c.text), fontSize: size * fontScale,
    fontFamily: rounded ? 'Nunito_800ExtraBold' : undefined, fontWeight: rounded ? undefined : weight,
    lineHeight: size * fontScale * (display ? 1.2 : 1.45), flexShrink: 1, textAlign: align }}>{children}</Text>;
}

export function Icon({ name, size = 22, color }: { name: SFSymbol; size?: number; color?: string }) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const scaled = size * Math.min(fontScale, 1.5);
  return <Image source={`sf:${name}`} accessible={false} tintColor={color ?? c.heading}
    style={{ width: scaled, height: scaled, fontWeight: 'bold' }} contentFit="contain" />;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const c = usePalette();
  return <View style={[{ backgroundColor: c.card, borderRadius: 16, borderWidth: 2,
    borderColor: c.line, padding: 20, gap: 16, borderCurve: 'continuous' }, style]}>{children}</View>;
}

export function ActionButton({ title, onPress, secondary = false, disabled = false, accessibilityLabel, icon, tone = 'default' }: {
  title: string; onPress(): void; secondary?: boolean; disabled?: boolean; accessibilityLabel?: string; icon?: SFSymbol;
  tone?: 'default' | 'cardinal';
}) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const ink = disabled ? c.secondary : tone === 'cardinal' ? c.red : secondary ? c.link : c.onAccent;
  return <View style={{ paddingBottom: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 54, paddingVertical: 13, paddingHorizontal: 18,
        borderRadius: 16, borderCurve: 'continuous', flexDirection: 'row', gap: 10,
        alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 4 : 0 }],
        backgroundColor: disabled ? c.disabled : tone === 'cardinal' ? '#ffffff' : secondary ? c.card : c.accent,
        borderWidth: secondary ? 2 : 0, borderColor: c.line,
        boxShadow: pressed || disabled ? 'none' : `0 4px 0 ${secondary || tone === 'cardinal' ? c.line : c.accentPressed}` })}>
      {icon && <Icon name={icon} color={ink} />}
      <Text allowFontScaling={false} style={{ flexShrink: 1, color: ink, fontWeight: '700', fontSize: 17 * fontScale,
        lineHeight: 24 * fontScale, textAlign: 'center', letterSpacing: 0.2 }}>{title}</Text>
    </Pressable>
  </View>;
}

export function HeaderButton({ title, icon, onPress, feedback = true }: { title: string; icon: SFSymbol; onPress(): void; feedback?: boolean }) {
  return <Pressable feedback={feedback} accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 44, minHeight: 44, padding: 10, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
    <Icon name={icon} />
  </Pressable>;
}

export function Badge({ children, icon, tone = 'neutral' }: PropsWithChildren<{ icon?: SFSymbol; tone?: 'neutral' | 'green' | 'blue' }>) {
  const c = usePalette();
  return <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    backgroundColor: tone === 'green' ? c.selection : tone === 'blue' ? c.blueSoft : c.soft }}>
    {icon && <Icon name={icon} size={14} />}
    <Label size={13} color={c.heading} weight="700">{children}</Label>
  </View>;
}

export function ProgressTrack({ value, total, label, blue = false, shimmer = false, height = 16 }: {
  value: number; total: number; label: string; blue?: boolean; shimmer?: boolean; height?: number;
}) {
  const c = usePalette();
  const reduced = useReducedMotion();
  return <View accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: total, now: value }}
    style={{ height, borderRadius: height / 2, backgroundColor: c.line, overflow: 'hidden' }}>
    {value > 0 && <View style={{ height: '100%', borderRadius: height / 2, width: `${Math.min(1, Math.max(0, value / Math.max(1, total))) * 100}%`,
      backgroundColor: blue ? c.blue : c.accent, paddingTop: height * 3 / 16, paddingHorizontal: height * 6 / 16, overflow: 'hidden' }}>
      <View style={{ height: height / 4, borderRadius: height / 8, backgroundColor: '#ffffff', opacity: shimmer ? 0.2 : 0.3 }} />
      {shimmer && !reduced && <Animated.View pointerEvents="none" accessible={false}
        style={{ position: 'absolute', inset: 0,
          // A broad, feathered reflection instead of a narrow white scanning stripe.
          experimental_backgroundImage: 'linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 25%, rgba(255,255,255,0.42) 42%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.42) 58%, rgba(255,255,255,0.14) 75%, rgba(255,255,255,0) 100%)',
          animationName: {
            from: { transform: [{ translateX: '-100%' }], opacity: 0 },
            '12%': { opacity: 1 },
            '53%': { opacity: 1 },
            '65%': { transform: [{ translateX: '100%' }], opacity: 0 },
            to: { transform: [{ translateX: '100%' }], opacity: 0 },
          },
          animationDuration: 4200, animationTimingFunction: 'linear', animationIterationCount: 'infinite',
        }} />}
    </View>}
  </View>;
}

export function Choice({ title, detail, selected, onPress, compact = false, selectionFill = true }: {
  title: string; detail?: string; selected: boolean; onPress(): void; compact?: boolean; selectionFill?: boolean;
}) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  return <Pressable accessibilityRole="radio" accessibilityLabel={detail ? `${title}. ${detail}` : title}
    accessibilityState={{ checked: selected }} onPress={onPress}
    style={({ pressed }) => ({ flexGrow: compact ? 1 : 0, flexBasis: compact ? (fontScale > 1.4 ? '100%' : 80) : undefined,
      minHeight: 54, padding: compact ? 12 : 16, borderWidth: 2, borderRadius: 14, gap: 8,
      borderColor: selected ? c.accentPressed : c.line, backgroundColor: selected && selectionFill ? c.selection : pressed ? c.soft : c.card,
      flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'center' : 'flex-start' })}>
    {!compact && <View style={{ paddingTop: 1 }}><Icon name={selected ? 'checkmark.circle.fill' : 'circle'} size={24} color={selected ? c.heading : c.secondary} /></View>}
    <View style={{ gap: 4, flex: compact ? undefined : 1 }}>
      <Label weight="700" color={c.heading} align={compact ? 'center' : undefined}>{title}</Label>
      {detail && <Label size={14} muted>{detail}</Label>}
    </View>
    {compact && <Icon name={selected ? 'checkmark.circle.fill' : 'circle'} size={17} color={selected ? c.heading : c.secondary} />}
  </Pressable>;
}
