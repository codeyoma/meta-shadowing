"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

function outsideDialog(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

/** Dismiss only gestures that start and finish on the backdrop, never a drag out. */
export function useDialogBackdrop(onClose: () => void) {
  const pointer = useRef<number | null>(null);
  const completedOutside = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      completedOutside.current = false;
      pointer.current = event.isPrimary && event.button === 0 && outsideDialog(event) ? event.pointerId : null;
    },
    onPointerUp(event: PointerEvent<HTMLDialogElement>) {
      completedOutside.current = pointer.current === event.pointerId && outsideDialog(event);
      pointer.current = null;
    },
    onPointerCancel() { pointer.current = null; completedOutside.current = false; },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const dismiss = completedOutside.current && outsideDialog(event);
      completedOutside.current = false;
      if (dismiss) { event.preventDefault(); onClose(); }
    }
  };
}
