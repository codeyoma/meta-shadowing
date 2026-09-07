"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CloseIcon } from "../ui";
import { useDialogBackdrop } from "../use-dialog-backdrop";
import styles from "./setup.module.css";

export function SessionOptions({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

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

  return <dialog {...backdrop} ref={dialogRef} id="session-options" className={styles.optionsDialog} aria-labelledby="session-title" onKeyDown={containTab} onCancel={event => { event.preventDefault(); close(); }}>
    <div className={styles.optionsHeading}>
      <h2 id="session-title">세션 설정</h2>
      <button type="button" className={styles.optionsButton} aria-label="세션 설정 닫기" onClick={close}><CloseIcon /></button>
    </div>
    <div className={styles.optionsBody}>{children}</div>
    <div className={styles.optionsFooter}><button type="button" className={styles.closeButton} onClick={close}>설정 닫기</button></div>
  </dialog>;
}
