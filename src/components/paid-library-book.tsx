import { useCallback, useSyncExternalStore } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { books } from '@/native/catalog';
import { isPaidDuo, paidAccess } from '@/native/paid-package';
import { HostedLibraryBook } from './hosted-library-book';
import { ActionButton, Label } from './ui';

export function PaidLibraryBook({editing,title}:{editing:boolean;title:string}) {
  const access=useSyncExternalStore(paidAccess.subscribe,paidAccess.getSnapshot);
  useFocusEffect(useCallback(() => {
    void paidAccess.refresh();
    const subscription=AppState.addEventListener('change',state => {if(state==='active') void paidAccess.refresh();});
    return () => subscription.remove();
  },[]));
  const book=books.find(isPaidDuo);
  if(!book) return null;
  return <View style={{gap:12}}>
    <HostedLibraryBook book={book} editing={editing} title={title} accessBlocked={!access.allowed} />
    {!access.allowed && <><Label muted>구매 확인이 필요해요. 자료와 학습 기록은 유지돼요.</Label>
      <ActionButton title="구매 다시 확인" secondary onPress={() => {void paidAccess.refresh();}} /></>}
  </View>;
}
