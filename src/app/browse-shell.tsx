"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Lesson } from "@/lib/lessons";
import { browseHref, resolveBrowseSelection, type BrowseSelection, type BrowseDestination } from "@/lib/browse-navigation";
import { BottomNavigation } from "./bottom-navigation";
import { LearnerTopNavigation } from "./learner-top-navigation";
import { Page } from "./ui";
import styles from "./browse.module.css";
import { DeviceSettingsProvider } from "./device-settings-provider";
import { LessonPackagesProvider } from "./lesson-packages-provider";
import { DeviceAccessProvider } from "./device-access-provider";

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
      // Activity hides the DOM after layout cleanup. Capture the position now,
      // even when a focus refresh beats the browser's asynchronous scroll event.
      save();
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", save);
    };
  }, [key, scrollPositions]);
  return ref;
}

type ShellProps = { catalog: Lesson[]; children: ReactNode };
export function BrowseShell({ catalog, children, accountId, profile }: ShellProps & { accountId: string; profile: { name: string; image: string | null } }) {
  return <DeviceAccessProvider key={accountId} accountId={accountId}><LessonPackagesProvider accountId={accountId} catalog={catalog}><DeviceSettingsProvider accountId={accountId} profile={profile}>
      <DeviceBrowseShell catalog={catalog}>{children}</DeviceBrowseShell>
  </DeviceSettingsProvider></LessonPackagesProvider></DeviceAccessProvider>;
}

function DeviceBrowseShell({ catalog, children }: ShellProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [scrollPositions] = useState(() => new Map<string, number>());
  const [remembered, setRemembered] = useState<BrowseSelection | null>(null);
  const selection = resolveBrowseSelection(pathname, new URLSearchParams(params.toString()), catalog, remembered);
  useEffect(() => {
    setRemembered(previous => previous?.language === selection.language && previous.lessonId === selection.lessonId ? previous : selection);
  }, [selection.language, selection.lessonId]);
  return <BrowseFrame catalog={catalog} selection={selection} scrollPositions={scrollPositions}>{children}</BrowseFrame>;
}

function BrowseFrame({ catalog, selection, scrollPositions, children }: ShellProps & {
  selection: BrowseSelection; scrollPositions: Map<string, number>;
}) {
  const pathname = usePathname();
  const active: BrowseDestination = pathname.startsWith("/settings") ? "settings"
    : pathname.endsWith("/stages") ? "stages" : pathname === "/lessons" ? "lessons" : "languages";
  return <BrowseContext.Provider value={{ catalog, selection, scrollPositions }}>
    <Page className={styles.page}>
      <LearnerTopNavigation className={styles.header} />
      <div className={`${styles.content} flex-col`}>
        {children}
      </div>
      <div className="contents">
      <BottomNavigation active={active} hrefs={{
        languages: browseHref("languages", selection), lessons: browseHref("lessons", selection),
        stages: browseHref("stages", selection), settings: browseHref("settings", selection),
      }} />
      </div>
    </Page>
  </BrowseContext.Provider>;
}
