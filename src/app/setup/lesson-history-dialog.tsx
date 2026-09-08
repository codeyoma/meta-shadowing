"use client";

import { useId, useState } from "react";
import { ChartColumn, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogViewportContent } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { completionHistoryForLesson, formatActiveTime, readLearningJournal, type CompletionRecord } from "@/lib/learning-records";
import { stageForLevel } from "@/lib/learning-stages";
import type { Lesson } from "@/lib/lessons";
import { RecordSettings } from "../completion-summary";
import styles from "./lesson-history-dialog.module.css";
import { useCloudPreferences } from "../cloud-preferences-provider";

function HistoryRow({ record }: { record: CompletionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const completedAt = new Date(record.completedAt);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return <>
    <TableRow>
      <TableHead scope="row" className="whitespace-normal">
        <span className="block">스테이지 {stageForLevel(record.level, record.stage)}</span>
        <span className="block">레벨 {record.level}</span>
      </TableHead>
      <TableCell>
        <time aria-label="완료 날짜" dateTime={record.completedAt}>
          <span className="block">{completedAt.toLocaleDateString("ko-KR")}</span>
          <span className="block">{completedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}</span>
        </time>
      </TableCell>
      <TableCell className="whitespace-normal"><span aria-label="활성 학습시간">{formatActiveTime(record.activeMs)}</span></TableCell>
      <TableCell>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="설정 보기" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
          <Chevron />
        </Button>
      </TableCell>
    </TableRow>
    {expanded ? <TableRow id={detailsId}>
      <TableCell colSpan={4} className="whitespace-normal">
        <div className="flex flex-col gap-2"><RecordSettings record={record} /></div>
      </TableCell>
    </TableRow> : null}
  </>;
}

export function LessonHistoryDialog({ lesson, disabled }: { lesson: Lesson; disabled?: boolean }) {
  const cloud = useCloudPreferences();
  const [open, setOpen] = useState(false);
  const [localHistory, setHistory] = useState<CompletionRecord[]>([]);
  const history = cloud ? completionHistoryForLesson(cloud.journal.history, lesson.id) : localHistory;

  function changeOpen(next: boolean) {
    if (next) {
      if (cloud) void cloud.refresh();
      else setHistory(completionHistoryForLesson(readLearningJournal().history, lesson.id));
    }
    setOpen(next);
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="inverse" size="lg" className="h-auto w-full min-w-0 self-stretch gap-2 px-2 whitespace-normal" disabled={disabled} aria-label="이 레슨의 완료 기록">
        <ChartColumn data-icon="inline-start" />
        <span className="min-w-0">완료 기록</span>
      </Button>
    </DialogTrigger>
    <DialogViewportContent panelClassName={styles.panel} footer={
      <DialogClose asChild><Button variant="close" size="lg" className="w-full"><X data-icon="inline-start" />닫기</Button></DialogClose>
    }>
      <DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>완료 기록</DialogTitle>
          <DialogClose asChild><Button variant="ghost" size="icon" aria-label="완료 기록 닫기"><X /></Button></DialogClose>
        </div>
        <DialogDescription>{lesson.name} · 총 {history.length}회 완료</DialogDescription>
      </DialogHeader>
      <div className={styles.body} data-slot="dialog-scroll-body">
        {history.length ? <Table density="compact" className="table-fixed" aria-label="이 레슨의 완료 기록">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">단계</TableHead>
              <TableHead className="w-[34%]">완료일시</TableHead>
              <TableHead className="whitespace-normal">학습시간</TableHead>
              <TableHead className="w-[52px]">설정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{history.map(record => <HistoryRow key={record.runId} record={record} />)}</TableBody>
        </Table> : <Empty className="min-h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartColumn /></EmptyMedia>
            <EmptyTitle>아직 완료한 학습이 없습니다.</EmptyTitle>
            <EmptyDescription>스테이지를 완료하면 날짜와 학습시간, 설정을 여기에서 확인할 수 있어요.</EmptyDescription>
          </EmptyHeader>
        </Empty>}
      </div>
    </DialogViewportContent>
  </Dialog>;
}
