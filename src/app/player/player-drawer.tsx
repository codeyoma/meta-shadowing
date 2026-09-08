"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { PublishedLesson } from "@/lib/lessons";
import { ArrowIcon, BackIcon, CheckIcon, GearIcon, LessonIcon } from "../ui";
import { centerCurrentSentence, SentenceList } from "./sentence-menu";
import styles from "./practice.module.css";

export type DrawerView = "menu" | "settings" | "sentences";

export function PlayerDrawer({ open, lesson, initialView, settings, currentPhraseNumbers, onSelect, onClose, onStages, onViewChange }: {
  open: boolean; lesson: PublishedLesson; initialView: "menu" | "settings"; settings: ReactNode;
  currentPhraseNumbers: readonly number[];
  onSelect: (phraseIndex: number) => void; onClose: () => void; onStages: () => void;
  onViewChange: (view: DrawerView) => void;
}) {
  const [view, setView] = useState<DrawerView>(initialView);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerId = useRef(initialView === "settings" ? "player-settings-trigger" : "player-menu-trigger");
  const returnView = useRef("settings");
  const resizeFrom = useRef<number | null>(null);
  const resizeAnimation = useRef<Animation | null>(null);
  const title = view === "settings" ? "세션 설정" : view === "sentences" ? "문장 목록" : "학습 메뉴";
  useLayoutEffect(() => {
    if (!open) return;
    setView(initialView);
    openerId.current = initialView === "settings" ? "player-settings-trigger" : "player-menu-trigger";
    returnView.current = "settings";
  }, [open, initialView]);

  useLayoutEffect(() => {
    const from = resizeFrom.current;
    resizeFrom.current = null;
    const dialog = dialogRef.current;
    if (from === null || !dialog || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = dialog.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) return;
    resizeAnimation.current = dialog.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 280, easing: "cubic-bezier(.16, 1, .3, 1)"
    });
    resizeAnimation.current.onfinish = () => {
      const list = dialog.querySelector<HTMLOListElement>('[data-slot="sentence-list"]');
      if (list) centerCurrentSentence(list);
    };
  }, [view]);
  useEffect(() => () => resizeAnimation.current?.cancel(), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const target = view === "menu" ? dialog.querySelector<HTMLButtonElement>(`[data-drawer-view="${returnView.current}"]`)
      : view === "settings" ? dialog.querySelector<HTMLButtonElement>("[data-drawer-back]") : null;
    target?.focus({ preventScroll: true });
  }, [open, view]);

  function close() {
    onClose();
  }
  function show(next: DrawerView) {
    if (next === view) return;
    // Read the displayed height first so rapid changes continue from mid-animation.
    resizeFrom.current = dialogRef.current?.getBoundingClientRect().height ?? null;
    resizeAnimation.current?.cancel();
    if (next !== "menu") returnView.current = next;
    setView(next);
    onViewChange(next);
  }

  return <Drawer open={open} onOpenChange={nextOpen => { if (!nextOpen) close(); }} direction="bottom" autoFocus handleOnly>
    <DrawerContent ref={dialogRef} id="player-menu" className={styles.drawer} data-view={view} aria-labelledby="player-menu-title"
      aria-describedby="player-menu-description"
      onOpenAutoFocus={event => {
        event.preventDefault();
        dialogRef.current?.querySelector<HTMLButtonElement>(initialView === "settings" ? "[data-drawer-back]" : '[data-drawer-view="settings"]')?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        document.getElementById(openerId.current)?.focus({ preventScroll: true });
      }}>
    <DrawerHeader className={styles.drawerHeader}>
      <div className={styles.drawerHeading}>
        {view !== "menu" ? <Button type="button" variant="context" size="icon" data-drawer-back aria-label="메뉴로 돌아가기" onClick={() => show("menu")}><BackIcon /></Button> : <Button asChild variant="ghost" size="icon" className="invisible" aria-hidden="true"><span /></Button>}
        <DrawerTitle id="player-menu-title">{title}</DrawerTitle>
        <span className={styles.drawerHeadingSpacer} aria-hidden="true" />
      </div>
      <DrawerDescription id="player-menu-description">{lesson.name} · {lesson.sectionCount}개 섹션 · {lesson.phraseCount}개 프레이즈</DrawerDescription>
    </DrawerHeader>
    {view === "menu" ? <nav className={styles.drawerNav} aria-label="학습 메뉴 항목">
      <Button type="button" variant="ghost" size="row" data-drawer-view="settings" onClick={() => show("settings")}><GearIcon data-icon="inline-start" /><span>학습 설정</span><ArrowIcon data-icon="inline-end" /></Button>
      <Button type="button" variant="ghost" size="row" data-drawer-view="sentences" onClick={() => show("sentences")}><LessonIcon data-icon="inline-start" /><span>문장 목록</span><ArrowIcon data-icon="inline-end" /></Button>
    </nav> : view === "settings" ? <div className={styles.settingsBody}>{settings}</div> :
      <SentenceList lesson={lesson} currentPhraseNumbers={currentPhraseNumbers} onSelect={index => { close(); onSelect(index); }} />}
    <DrawerFooter className={styles.drawerFooter}>
      <Button type="button" variant="practice" size="lg" onClick={close}><CheckIcon data-icon="inline-start" />확인</Button>
      <Button type="button" variant="stage-exit" size="sm" onClick={() => { close(); onStages(); }}><Map aria-hidden="true" data-icon="inline-start" />스테이지 화면으로</Button>
    </DrawerFooter>
  </DrawerContent></Drawer>;
}
