import { isLoaded } from 'expo-font';
import type { TextStyle } from 'react-native';

/** Explicit learning fonts use verified regular faces; other text keeps its existing style. */
export function textFontStyle(fontFamily: string | undefined, display: boolean, weight: TextStyle['fontWeight']) {
  const rounded = !fontFamily && display && isLoaded('Nunito_800ExtraBold');
  return {
    fontFamily: fontFamily ?? (rounded ? 'Nunito_800ExtraBold' : undefined),
    fontWeight: fontFamily ? '400' as const : rounded ? undefined : weight,
  };
}
