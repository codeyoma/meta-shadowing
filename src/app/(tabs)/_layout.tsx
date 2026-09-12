import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Image } from 'react-native';
import { usePalette } from '@/components/ui';
import { tapFeedback } from '@/native/tap-feedback';

export const unstable_settings = { initialRouteName: 'index' };
const mascot = { ...Image.resolveAssetSource(require('../../../assets/brand/mascot.png')), width: 36, height: 36 };

export default function BrowsingTabs() {
  const c = usePalette();
  return <NativeTabs backgroundColor={c.background} tintColor={c.heading}
    iconColor={{ default: c.secondary, selected: c.heading }}>
    <NativeTabs.Trigger name="brand" disabled accessibilityLabel="쇄도잉 로고">
      <NativeTabs.Trigger.Icon renderingMode="original" src={mascot} />
      <NativeTabs.Trigger.Label hidden>쇄도잉</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="index" listeners={{ tabPress: event => tapFeedback(!event.data.isPrevented) }} accessibilityLabel="도서 선택" contentStyle={{ backgroundColor: c.background }} disableTransparentOnScrollEdge>
      <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} md="menu_book" />
      <NativeTabs.Trigger.Label hidden>도서 선택</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="lesson" listeners={{ tabPress: event => tapFeedback(!event.data.isPrevented) }} accessibilityLabel="스테이지" contentStyle={{ backgroundColor: c.background }} disableTransparentOnScrollEdge>
      <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      <NativeTabs.Trigger.Label hidden>스테이지</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings" listeners={{ tabPress: event => tapFeedback(!event.data.isPrevented) }} accessibilityLabel="설정" contentStyle={{ backgroundColor: c.background }} disableTransparentOnScrollEdge>
      <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      <NativeTabs.Trigger.Label hidden>설정</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
