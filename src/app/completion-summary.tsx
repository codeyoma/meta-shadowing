"use client";

import { formatActiveTime, type CompletionRecord } from "@/lib/learning-records";
import { RAPID_WPM } from "@/lib/rapid-session";

export function RecordDetails({ record }: { record: CompletionRecord }) {
  const settings = record.settings;
  return <>
    <p><time aria-label="완료 날짜" dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString("ko-KR")}</time></p>
    <p>활성 학습시간 <strong aria-label="활성 학습시간">{formatActiveTime(record.activeMs)}</strong></p>
    <details className="record-settings">
      <summary>설정 보기</summary>
      <p>버전 {record.lessonVersion}</p>
      <p>{settings.mode === "automatic" ? "자동" : "수동"} · {record.level >= 6
        ? `${RAPID_WPM[settings.wpmLevel]} WPM · ${settings.display === "current" ? "현재 단어" : "누적 단어"}`
        : `${settings.speed}×${record.level >= 4 ? ` · ${settings.groupSize}개 묶음` : ""}`}</p>
      {record.level >= 6 ? <p>말하기 추가 {settings.speakingExtraMs / 1000}초 · 문장 간격 {settings.lineGapMs / 1000}초 · 구간 간격 {settings.sectionGapMs / 1000}초</p>
        : <p>다음 이동 대기 {settings.advanceDelayMs / 1000}초{record.level >= 4 ? ` · 묶음 원음 간격 ${settings.groupGapMs / 1000}초` : ""}</p>}
    </details>
  </>;
}

export function CompletionSummary({ record, storageFailed = false, onHome }: { record: CompletionRecord; storageFailed?: boolean; onHome: () => void }) {
  return <div className="practice-canvas completion-canvas">
    <h2>레벨 {record.level} 학습 완료</h2>
    <p className="completion-percent">100%</p>
    <RecordDetails record={record} />
    {storageFailed ? <p role="alert">브라우저에 기록을 저장하지 못했습니다. 저장 공간과 권한을 확인해 주세요.</p> : null}
    <button type="button" className="primary-button" onClick={onHome}>레슨 목록으로</button>
  </div>;
}
