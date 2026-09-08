import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// #18 prepares account preferences only. Never start a browser-backed practice
// under the cloud flag while server-confirmed progress (#19+) is unfinished.
export function CloudLearningNotice() {
  return <Alert>
    <AlertTitle>클라우드 학습 준비 중</AlertTitle>
    <AlertDescription>계정 설정을 동기화할 수 있습니다. 진도 저장 연결이 끝나기 전에는 학습을 시작할 수 없습니다. 기존 브라우저 학습 기록은 그대로 보관됩니다.</AlertDescription>
    <Button asChild variant="outline"><Link href="/settings/session">계정 설정</Link></Button>
  </Alert>;
}
