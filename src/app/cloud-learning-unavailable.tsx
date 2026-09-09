import { LearnerSignOut } from "./learner-sign-out";

/** The server switch stops entry; it never selects a second persistence source. */
export function CloudLearningUnavailable() {
  return <main className="page mx-auto flex max-w-sm flex-col gap-4 p-5">
    <h1>계정 학습이 잠시 중지되었습니다.</h1>
    <p role="status">서버 연결을 준비하고 있습니다. 저장된 계정 기록은 유지되며, 브라우저 기록으로 대신 학습하지 않습니다.</p>
    <LearnerSignOut />
  </main>;
}
