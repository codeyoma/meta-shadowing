"use client";

import { useRef, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { CloseIcon } from "../ui";
import styles from "./practice.module.css";

export function PracticeHelp({ instruction, open, onOpen, onClose, children }: {
  instruction: string; open: boolean; onOpen: () => void; onClose: () => void; children: ReactElement;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return <Popover open={open} onOpenChange={next => next ? onOpen() : onClose()} modal>
    <PopoverTrigger asChild>{children}</PopoverTrigger>
    <PopoverContent id="practice-help" variant="soft" className={styles.helpPopup} side="bottom" align="start" sideOffset={12} collisionPadding={20}
      aria-labelledby="practice-help-title" aria-describedby="practice-instruction"
      onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        document.getElementById("practice-help-trigger")?.focus({ preventScroll: true });
      }}>
      <PopoverHeader>
        <div className={styles.helpHeading}>
          <PopoverTitle id="practice-help-title" role="heading" aria-level={2}>학습 방법</PopoverTitle>
          <Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label="학습 방법 닫기" onClick={onClose}><CloseIcon /></Button>
        </div>
        <PopoverDescription id="practice-instruction" className={styles.instruction}>{instruction}</PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>;
}
