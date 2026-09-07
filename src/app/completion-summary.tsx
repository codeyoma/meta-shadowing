"use client";

import { formatActiveTime, type CompletionRecord } from "@/lib/learning-records";
import { RAPID_WPM } from "@/lib/rapid-session";
import { stageForLevel } from "@/lib/learning-stages";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import styles from "./learner.module.css";

export function RecordDetails({ record }: { record: CompletionRecord }) {
  const settings = record.settings;
  return <>
    <p><time aria-label="완료 날짜" dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleString("ko-KR")}</time></p>
    <p>활성 학습시간 <strong aria-label="활성 학습시간">{formatActiveTime(record.activeMs)}</strong></p>
    <Accordion type="single" collapsible>
      <AccordionItem value="record-settings">
      <AccordionTrigger>설정 보기</AccordionTrigger>
      <AccordionContent className="space-y-2">
      <p>버전 {record.lessonVersion}</p>
      <p>{settings.mode === "automatic" ? "자동" : "수동"} · {record.level >= 6
        ? `${RAPID_WPM[settings.wpmLevel]} WPM · ${settings.display === "current" ? "현재 단어" : "누적 단어"}`
        : `${settings.speed}×${record.level >= 4 ? ` · ${settings.groupSize}개 묶음` : ""}`}</p>
      {record.level >= 6 ? <p>말하기 추가 {settings.speakingExtraMs / 1000}초 · 문장 간격 {settings.lineGapMs / 1000}초 · 구간 간격 {settings.sectionGapMs / 1000}초</p>
        : <p>다음 이동 대기 {settings.advanceDelayMs / 1000}초{record.level >= 4 ? ` · 묶음 원음 간격 ${settings.groupGapMs / 1000}초` : ""}</p>}
      </AccordionContent>
      </AccordionItem>
    </Accordion>
  </>;
}

export function CompletionSummary({ record, storageFailed = false, onHome }: { record: CompletionRecord; storageFailed?: boolean; onHome: () => void }) {
  return <div className={styles.completion}>
    <h2>레벨 {record.level} 학습 완료</h2>
    <p>스테이지 {stageForLevel(record.level, record.stage)}</p>
    <p className={styles.completionPercent}>100%</p>
    <RecordDetails record={record} />
    {storageFailed ? <Alert variant="destructive"><AlertDescription>브라우저에 기록을 저장하지 못했습니다. 저장 공간과 권한을 확인해 주세요.</AlertDescription></Alert> : null}
    <Button type="button" className="w-full" onClick={onHome}>레슨 목록으로</Button>
  </div>;
}
