import { ScrollView, View, useColorScheme } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Label, usePalette } from '@/components/ui';
import { FeedbackPressable as Pressable } from '@/components/feedback-pressable';
import { LibraryBook } from '@/components/library-book';
import { PackagePurchaseCard } from '@/components/package-purchase-card';
import { useLibrary } from '@/components/library-context';
import { availableBooks } from '@/core/catalog';
import { books } from '@/native/catalog';
import { DeliveryDiagnostics } from '@/components/delivery-diagnostics';
import { animationPreviewEnabled } from '../../../modules/package-delivery';
import { isPaidDuo } from '@/native/paid-package';
import { localVideoPackageInvalid } from '@/native/video-package';

export default function Library() {
  const c = usePalette();
  const dark = useColorScheme() === 'dark';
  const { selection } = useLibrary();
  const [editing, setEditing] = useState(false);
  const catalog = availableBooks(books, selection.language).filter(book => !isPaidDuo(book));
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
    <View style={{ alignSelf: 'center', width: '100%', maxWidth: 260 }}>
      <Image source={dark ? require('../../../assets/brand/banner-dark.png') : require('../../../assets/brand/banner-light.png')} accessibilityLabel="쇄도잉" accessible
        contentFit="contain" style={{ width: '100%', aspectRatio: 2 }} />
    </View>
    <View style={{ gap: 14 }}>
      <View style={{ minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Label size={23} weight="800" color={c.heading}>구매한 도서</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 }}>
          {animationPreviewEnabled && <Pressable accessibilityRole="button" accessibilityLabel="다운로드 애니메이션 미리보기"
            onPress={() => router.push('/download-preview')} style={({ pressed }) => ({ minWidth: 44, minHeight: 44,
              paddingHorizontal: 8, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Label size={14} weight="700" color={c.link}>미리보기</Label>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? '편집 완료' : '학습 자료 편집'}
            onPress={() => setEditing(value => !value)} style={({ pressed }) => ({ minWidth: 60, minHeight: 44,
              paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Label size={16} weight="700" color={c.link}>{editing ? '완료' : '편집'}</Label>
          </Pressable>
        </View>
      </View>
      {catalog.map(book => <LibraryBook key={book.packageKey} book={book} editing={editing} />)}
      {localVideoPackageInvalid && <Label muted>동영상 자료를 읽을 수 없어요. 자료를 다시 준비한 개발 빌드로 설치해 주세요.</Label>}
      {selection.language === 'english' && <PackagePurchaseCard section="owned" editing={editing} />}
      {!catalog.length && <Label muted>이 언어에서 지원하는 구매/샘플 도서가 아직 없어요.</Label>}
    </View>
    {selection.language === 'english' && <PackagePurchaseCard section="store" />}
    <DeliveryDiagnostics />
  </ScrollView>;
}
