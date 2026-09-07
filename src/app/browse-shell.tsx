"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Lesson } from "@/lib/lessons";
import { BROWSE_SELECTION_KEY, browseHref, resolveBrowseSelection, type BrowseSelection, type BrowseDestination } from "@/lib/browse-navigation";
import { readLastSelection } from "@/lib/resume";
import { BottomNavigation } from "./bottom-navigation";
import { LearnerTopNavigation } from "./learner-top-navigation";
import { Page } from "./ui";
import styles from "./browse.module.css";

const BrowseContext = createContext<{ catalog: Lesson[]; selection: BrowseSelection; scrollPositions: Map<string, number> } | null>(null);

export function useBrowse() {
  const value = useContext(BrowseContext);
  if (!value) throw new Error("Browse screens require BrowseShell");
  return value;
}

export function useBrowseScroll(key: string) {
  const { scrollPositions } = useBrowse();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const restore = () => { viewport.scrollTop = scrollPositions.get(key) ?? 0; };
    restore();
    const frame = requestAnimationFrame(restore);
    const save = () => scrollPositions.set(key, viewport.scrollTop);
    viewport.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", save);
    };
  }, [key, scrollPositions]);
  return ref;
}

export function BrowseShell({ catalog, children }: { catalog: Lesson[]; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [saved, setSaved] = useState<BrowseSelection | null>(null);
  const [ready, setReady] = useState(false);
  const [scrollPositions] = useState(() => new Map<string, number>());
  const selection = resolveBrowseSelection(pathname, new URLSearchParams(params.toString()), catalog, saved);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(BROWSE_SELECTION_KEY) ?? "null");
      const last = readLastSelection();
      setSaved(resolveBrowseSelection("", new URLSearchParams(), catalog, value ?? last));
    } catch { /* Browsing remains available without storage. */ }
    setReady(true);
  }, [catalog]);
  useEffect(() => {
    if (!ready) return;
    setSaved(previous => previous?.language === selection.language && previous.lessonId === selection.lessonId ? previous : selection);
    try { localStorage.setItem(BROWSE_SELECTION_KEY, JSON.stringify(selection)); } catch { /* Best effort. */ }
  }, [ready, selection.language, selection.lessonId]);
  const active: BrowseDestination = pathname.startsWith("/settings") ? "settings"
    : pathname.endsWith("/stages") ? "stages" : pathname === "/lessons" ? "lessons" : "languages";
  return <BrowseContext.Provider value={{ catalog, selection, scrollPositions }}>
    <Page className={styles.page}>
      <LearnerTopNavigation className={styles.header} />
      <div className={styles.content}>{children}</div>
      <BottomNavigation active={active} hrefs={{
        languages: browseHref("languages", selection), lessons: browseHref("lessons", selection),
        stages: browseHref("stages", selection), settings: browseHref("settings", selection),
      }} />
    </Page>
  </BrowseContext.Provider>;
}
