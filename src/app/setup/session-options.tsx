"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function SessionOptions({ children, open, onOpenChange, triggerRef }: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Preserve text-selection drags: only gestures beginning and ending outside dismiss.
  // Capture pointer events directly because Radix defers touch outside events until click.
  useEffect(() => {
    if (!open) return;
    let pointer: number | null = null;
    const outside = (event: PointerEvent) => {
      const content = contentRef.current;
      if (!content || (event.target instanceof Node && content.contains(event.target))) return false;
      const box = content.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    const down = (event: PointerEvent) => {
      pointer = event.isPrimary && event.button === 0 && outside(event) ? event.pointerId : null;
    };
    const up = (event: PointerEvent) => {
      const dismiss = pointer === event.pointerId && outside(event);
      pointer = null;
      if (dismiss) onOpenChange(false);
    };
    const cancel = () => { pointer = null; };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
    };
  }, [open, onOpenChange]);

  return <Drawer open={open} onOpenChange={onOpenChange} autoFocus handleOnly>
    <DrawerContent ref={contentRef} id="session-options" aria-labelledby="session-title" aria-describedby={undefined} className="mx-auto w-full max-w-lg" onPointerDownOutside={event => event.preventDefault()} onKeyDownCapture={event => {
      // With no header action, a roving-focus group is the first tab stop.
      // Radix's outer focus scope sees the group, not its focused child, so
      // explicitly wrap its backward edge instead of refocusing that same child.
      if (event.key !== "Tab" || !event.shiftKey) return;
      const group = event.currentTarget.querySelector('[data-slot="toggle-group"]');
      if (!group?.contains(event.target as Node)) return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, [tabindex]")]
        .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      event.preventDefault();
      controls.at(-1)?.focus();
    }} onCloseAutoFocus={event => {
      event.preventDefault();
      triggerRef.current?.focus();
    }}>
      <DrawerHeader className="flex-row items-center justify-between">
        <DrawerTitle id="session-title">세션 설정</DrawerTitle>
      </DrawerHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </DrawerContent>
  </Drawer>;
}
