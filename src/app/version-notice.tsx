import { Alert, AlertDescription } from "@/components/ui/alert";

export function VersionNotice({ storageFailed }: { storageFailed: boolean }) {
  return <Alert aria-label="레슨 버전 변경">
    <AlertDescription>
      <p>레슨이 새 버전으로 변경되어 이전 진도를 초기화했습니다. 첫 프레이즈부터 다시 시작합니다. 완료 기록은 유지됩니다.</p>
      {storageFailed ? <p>브라우저 저장소를 갱신하지 못했습니다. 이 학습에서는 이전 진도를 사용하지 않습니다.</p> : null}
    </AlertDescription>
  </Alert>;
}
