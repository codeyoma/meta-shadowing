"use client";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function BrowseError({ retry }: { retry: () => void }) {
  return <Empty role="alert"><EmptyHeader><EmptyTitle>화면을 불러오지 못했습니다.</EmptyTitle>
    <EmptyDescription>연결을 확인하고 다시 시도해 주세요.</EmptyDescription></EmptyHeader>
    <Button type="button" onClick={retry}>다시 시도</Button>
  </Empty>;
}
