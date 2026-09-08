import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Unconverted modes must never fall back to browser-backed records.
export function CloudLearningNotice() {
  return <Alert>
    <AlertTitle>클라우드 학습 준비 중</AlertTitle>
    <AlertDescription>현재 클라우드는 레벨 1–3 수동 프레이즈 학습만 지원합니다. 자동·묶음·빠른 학습은 연결 준비 중입니다. 계정 설정에서 수동 모드를 선택해 주세요. 기존 브라우저 학습 기록은 그대로 보관됩니다.</AlertDescription>
    <Button asChild variant="outline"><Link href="/settings/session">계정 설정</Link></Button>
  </Alert>;
}
