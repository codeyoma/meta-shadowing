"use client";

import { type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerViewportContent } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { learningInstructions } from "@/lib/learning-stages";
import { levelNames } from "@/lib/lessons";
import { CloseIcon } from "../ui";
import styles from "./practice.module.css";

export function PracticeHelp({ level, open, onOpen, onClose, children }: {
  level: number; open: boolean; onOpen: () => void; onClose: () => void; children: ReactElement;
}) {
  return <Drawer open={open} onOpenChange={next => next ? onOpen() : onClose()}>
    <DrawerTrigger asChild>{children}</DrawerTrigger>
    <DrawerViewportContent id="practice-help" panelClassName={styles.helpPanel}
      footer={<DrawerClose asChild><Button type="button" variant="practice" size="lg" className="w-full"><CloseIcon />닫기</Button></DrawerClose>}
      onOpenAutoFocus={event => {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('#practice-help [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        document.getElementById("practice-help-trigger")?.focus({ preventScroll: true });
      }}>
      <DrawerHeader>
        <DrawerTitle>학습 방법</DrawerTitle>
        <DrawerDescription>레벨별 학습 방법을 확인하세요.</DrawerDescription>
      </DrawerHeader>
      <Tabs defaultValue={String(level)} className={styles.helpTabs}>
        <TabsList variant="levels" aria-label="학습 레벨">
          {levelNames.map((_, index) => <TabsTrigger key={index} value={String(index + 1)}>Lv {index + 1}</TabsTrigger>)}
        </TabsList>
        {levelNames.map((name, index) => <TabsContent key={index} value={String(index + 1)} className={styles.helpContent} data-slot="dialog-scroll-body">
          <DrawerHeader>
            <h3>{name}</h3>
            <p id={index + 1 === level ? "practice-instruction" : undefined}>{learningInstructions[index]}</p>
          </DrawerHeader>
          <Empty><EmptyDescription>상세 학습 방법은 준비 중입니다.</EmptyDescription></Empty>
        </TabsContent>)}
      </Tabs>
    </DrawerViewportContent>
  </Drawer>;
}
