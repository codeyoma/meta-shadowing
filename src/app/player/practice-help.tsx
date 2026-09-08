"use client";

import { type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogViewportContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { learningInstructions } from "@/lib/learning-stages";
import { levelNames } from "@/lib/lessons";
import { CloseIcon } from "../ui";
import styles from "./practice.module.css";

export function PracticeHelp({ level, open, onOpen, onClose, children }: {
  level: number; open: boolean; onOpen: () => void; onClose: () => void; children: ReactElement;
}) {
  return <Dialog open={open} onOpenChange={next => next ? onOpen() : onClose()}>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogViewportContent id="practice-help" panelClassName={styles.helpPanel}
      footer={<DialogClose asChild><Button type="button" variant="close" size="lg" className="w-full"><CloseIcon />닫기</Button></DialogClose>}
      onOpenAutoFocus={event => {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('#practice-help [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        document.getElementById("practice-help-trigger")?.focus({ preventScroll: true });
      }}>
      <DialogHeader>
        <DialogTitle>학습 방법</DialogTitle>
        <DialogDescription>레벨별 학습 방법을 확인하세요.</DialogDescription>
      </DialogHeader>
      <Tabs defaultValue={String(level)} className={styles.helpTabs}>
        <TabsList variant="levels" aria-label="학습 레벨">
          {levelNames.map((_, index) => <TabsTrigger key={index} value={String(index + 1)}>Lv {index + 1}</TabsTrigger>)}
        </TabsList>
        {levelNames.map((name, index) => <TabsContent key={index} value={String(index + 1)} className={styles.helpContent} data-slot="dialog-scroll-body">
          <DialogHeader>
            <h3>{name}</h3>
            <p id={index + 1 === level ? "practice-instruction" : undefined}>{learningInstructions[index]}</p>
          </DialogHeader>
          <Empty><EmptyDescription>상세 학습 방법은 준비 중입니다.</EmptyDescription></Empty>
        </TabsContent>)}
      </Tabs>
    </DialogViewportContent>
  </Dialog>;
}
