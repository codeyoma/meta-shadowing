"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export type ActionableProblem = {
  scope: string; key: string; title: string; description: string; explicit?: boolean;
  dismissLabel?: string; onDismiss?: () => void;
  action?: { label: string; run: () => void };
  exit?: { label: string; run: () => void };
  returnFocus?: HTMLElement | null | (() => HTMLElement | null);
};
type Entry = ActionableProblem & { identity: string; origin: HTMLElement | null };
type Control = { show(problem: ActionableProblem): void; resolve(scope: string, key: string): void; clearScope(scope: string): void };
const noop = () => {};
const Context = createContext<Control>({ show: noop, resolve: noop, clearScope: noop });
export const useActionableDialog = () => useContext(Context);

/** One root host owns all actionable errors and destructive confirmations. */
export function ActionableDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Entry[]>([]);
  const seen = useRef(new Map<string, string>());
  const dismissButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const show = useCallback((problem: ActionableProblem) => {
    const identity = JSON.stringify([problem.scope, problem.key]);
    if (seen.current.has(identity) && !problem.explicit) return;
    seen.current.set(identity, problem.scope);
    const returnFocus = typeof problem.returnFocus === "function" ? problem.returnFocus() : problem.returnFocus;
    const entry = { ...problem, identity, origin: returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) };
    setQueue(previous => {
      if (entry.origin?.closest('[role="alertdialog"]')) entry.origin = previous[0]?.origin ?? null;
      return previous.some(item => item.identity === identity) ? previous.map(item => item.identity === identity ? { ...entry, origin: item.origin } : item) : [...previous, entry];
    });
  }, []);
  const resolve = useCallback((scope: string, key: string) => {
    const identity = JSON.stringify([scope, key]); seen.current.delete(identity);
    setQueue(previous => previous.filter(item => item.identity !== identity));
  }, []);
  const clearScope = useCallback((scope: string) => {
    for (const [identity, owner] of seen.current) if (owner === scope) seen.current.delete(identity);
    setQueue(previous => previous.filter(item => item.scope !== scope));
  }, []);
  const control = useMemo(() => ({ show, resolve, clearScope }), [show, resolve, clearScope]);
  const active = queue[0];
  const close = (action?: () => void) => {
    if (!active) return;
    origin.current = active.origin;
    setQueue(previous => previous.filter(item => item.identity !== active.identity));
    (action ?? active.onDismiss)?.();
  };
  useEffect(() => { if (active) { origin.current = active.origin; dismissButton.current?.focus(); } }, [active?.identity]);
  useEffect(() => {
    if (active || !origin.current?.isConnected) return;
    const target = origin.current;
    const focus = () => { if (!target.matches(":disabled") && target.isConnected) { target.focus(); observer.disconnect(); } };
    const observer = new MutationObserver(focus);
    observer.observe(target, { attributes: true, attributeFilter: ["disabled"] });
    focus();
    return () => observer.disconnect();
  }, [active]);
  return <Context.Provider value={control}>{children}
    <Dialog open={!!active} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent role="alertdialog" showCloseButton={false} overlayClassName="backdrop-blur-sm"
        onOpenAutoFocus={event => { event.preventDefault(); dismissButton.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus(); }}>
        <DialogTitle>{active?.title}</DialogTitle>
        <DialogDescription>{active?.description}</DialogDescription>
        <DialogFooter>
          <Button ref={dismissButton} variant="outline" onClick={() => close()}>{active?.dismissLabel ?? "닫기"}</Button>
          {active?.exit ? <Button variant="outline" onClick={() => close(active.exit!.run)}>{active.exit.label}</Button> : null}
          {active?.action ? <Button variant="outline" onClick={() => close(active.action!.run)}>{active.action.label}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Context.Provider>;
}

/** Dismissal never changes the caller's blocking state. Resolution is explicit. */
export function useActionableProblem(active: boolean, problem: ActionableProblem) {
  const dialogs = useActionableDialog();
  const latest = useRef(problem); latest.current = problem;
  useEffect(() => {
    if (active) dialogs.show({ ...latest.current,
      action: latest.current.action ? { label: latest.current.action.label, run: () => latest.current.action?.run() } : undefined,
      exit: latest.current.exit ? { label: latest.current.exit.label, run: () => latest.current.exit?.run() } : undefined });
    else dialogs.resolve(problem.scope, problem.key);
    return () => dialogs.resolve(problem.scope, problem.key);
  }, [active, problem.scope, problem.key, dialogs]);
}
