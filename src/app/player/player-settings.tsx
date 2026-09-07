"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CloseIcon } from "../ui";
import { useDialogBackdrop } from "../use-dialog-backdrop";
import styles from "./practice.module.css";

export function PlayerSettings({ id, children, onClose }: { id: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    // Pointer activation does not focus buttons in every browser.
    const opener = document.getElementById(`${id}-trigger`);
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [id]);

  function close() {
    dialogRef.current?.close();
    onClose();
  }
  const backdrop = useDialogBackdrop(close);

  function containTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)");
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  return <dialog {...backdrop} ref={dialogRef} id={id} className={`${styles.sentenceMenu} ${styles.settingsDialog}`} aria-labelledby={`${id}-title`}
    onKeyDown={containTab} onCancel={event => { event.preventDefault(); close(); }}>
    <div className={`${styles.menuHeader} ${styles.settingsHeading}`}>
      <h2 id={`${id}-title`}>세션 설정</h2>
      <button type="button" className={`${styles.iconButton} ${styles.settingsClose}`} aria-label="학습 설정 닫기" onClick={close}><CloseIcon /></button>
    </div>
    <div className={styles.settingsBody}>{children}</div>
    <div className={styles.menuFooter}>
      <button type="button" className={`${styles.action} ${styles.primary} ${styles.menuClose}`} onClick={close}>설정 닫기</button>
    </div>
  </dialog>;
}
