"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { PublishedLesson } from "@/lib/lessons";
import { BackIcon, CloseIcon } from "../ui";
import { useDialogBackdrop } from "../use-dialog-backdrop";
import styles from "./practice.module.css";

export function SentenceMenu({ lesson, currentPhraseNumbers, grouped, onSelect, onClose, onHome }: {
  lesson: PublishedLesson; currentPhraseNumbers: readonly number[]; grouped?: boolean;
  onSelect: (phraseIndex: number) => void; onClose: () => void; onHome: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.getElementById("sentence-menu-trigger");
    dialog.showModal();
    const current = listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "center" });
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }
  const backdrop = useDialogBackdrop(close);

  function containTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  return <dialog {...backdrop} ref={dialogRef} id="sentence-menu" className={styles.sentenceMenu} aria-labelledby="sentence-menu-title" aria-describedby="sentence-menu-help" onKeyDown={containTab} onCancel={event => { event.preventDefault(); close(); }}>
    <div className={styles.menuHeader}>
      <div><h2 id="sentence-menu-title">문장 목록</h2><p>{lesson.name} · {lesson.phrases.length}문장</p></div>
      <button type="button" className={`${styles.action} ${styles.primary} ${styles.menuHome}`} onClick={() => { close(); onHome(); }}><BackIcon />첫 화면으로</button>
    </div>
    <p id="sentence-menu-help" className={styles.menuHelp}>{grouped ? "문장을 선택하면 해당 묶음의 처음부터 연습합니다." : "연습할 문장을 선택하세요."} 재생은 일시정지됩니다.</p>
    <ol ref={listRef} className={styles.sentenceList}>
      {lesson.entries.map((entry, index) => entry.kind === "chapter"
        ? <li key={`chapter-${index}`} className={styles.menuChapter}><h3 lang={lesson.language === "english" ? "en" : "ja"}>{entry.target}</h3>{entry.korean ? <p lang="ko">{entry.korean}</p> : null}</li>
        : entry.kind === "section" ? <li key={`section-${index}`} className={styles.menuSection}><hr aria-label="구간 경계" /></li>
        : <li key={entry.phraseNumber}>
          <button type="button" className={styles.sentenceChoice} aria-current={currentPhraseNumbers.includes(entry.phraseNumber) ? "true" : undefined}
            aria-label={`${entry.phraseNumber}번 문장 · ${entry.target} · ${entry.korean}`} onClick={() => { close(); onSelect(entry.phraseNumber - 1); }}>
            <span className={styles.sentenceNumber} aria-hidden="true">{entry.phraseNumber}</span>
            <span className={styles.sentenceCopy}><span lang={lesson.language === "english" ? "en" : "ja"}>{entry.target}</span><small lang="ko">{entry.korean}</small></span>
          </button>
        </li>)}
    </ol>
    <div className={styles.menuFooter}><button type="button" className={`${styles.action} ${styles.primary} ${styles.menuClose}`} aria-label="문장 목록 닫기" onClick={close}><CloseIcon />닫기</button></div>
  </dialog>;
}
