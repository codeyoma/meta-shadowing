import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Label, usePalette } from '@/components/ui';
import { LibraryBook } from '@/components/library-book';
import { PackagePurchaseCard } from '@/components/package-purchase-card';
import { useLibrary } from '@/components/library-context';
import { availableBooks } from '@/core/catalog';
import { books, languages } from '@/native/catalog';

export default function Library() {
  const c = usePalette();
  const { selection } = useLibrary();
  const catalog = availableBooks(books, selection.language);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
    <View style={{ backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', alignSelf: 'center', width: '100%', maxWidth: 260 }}>
      <Image source={require('../../../assets/brand/logo.png')} accessibilityLabel="쇄도잉" accessible
        contentFit="contain" style={{ width: '100%', aspectRatio: 2 }} />
    </View>
    <Label size={27} weight="800" color={c.heading}>{languages.find(l => l.id === selection.language)?.name} 도서</Label>
    {catalog.map(book => <LibraryBook key={book.packageKey} book={book} />)}
    {selection.language === 'english' && <PackagePurchaseCard />}
    {!catalog.length && <Label muted>이 언어에서 지원하는 도서가 아직 없어요.</Label>}
  </ScrollView>;
}
