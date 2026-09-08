"use client";

import { Activity, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Lesson } from "@/lib/lessons";
import { BROWSE_SELECTION_KEY, browseHref, resolveBrowseSelection, type BrowseSelection, type BrowseDestination } from "@/lib/browse-navigation";
import { readLastSelection } from "@/lib/resume";
import { BottomNavigation } from "./bottom-navigation";
import { LearnerTopNavigation } from "./learner-top-navigation";
import { Page } from "./ui";
import styles from "./browse.module.css";
import { CloudPreferencesProvider, useCloudPreferences } from "./cloud-preferences-provider";

const BrowseContext = createContext<{ catalog: Lesson[]; selection: BrowseSelection; scrollPositions: Map<string, number>; cloud?: boolean } | null>(null);

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
export function BrowseShell({ catalog, children, accountId }: ShellProps & { accountId?: string }) {
  return accountId ? <CloudPreferencesProvider key={accountId} accountId={accountId}>
    <CloudBrowseShell catalog={catalog}>{children}</CloudBrowseShell>
  </CloudPreferencesProvider> : <LegacyBrowseShell catalog={catalog}>{children}</LegacyBrowseShell>;
}

function CloudBrowseShell({ catalog, children }: ShellProps) {
  const cloud = useCloudPreferences()!;
  const pathname = usePathname();
  const params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const [scrollPositions] = useState(() => new Map<string, number>());
  const selectionIntent = useRef<{ selection: BrowseSelection; revision: number } | null>(null);
  const explicit = params.has("language") || params.has("lesson") || pathname.endsWith("/stages");
  // URL parameters express intent, but the accepted server selection drives the UI.
  // In particular, a rejected intent must not leak into the next navigation's URL.
  const selection = cloud.profile.selection ?? { language: "english" as const, lessonId: null };
  useEffect(() => {
    if (cloud.visitRoute(route)) {
      // Capture intent against the profile the user saw, before the entry refetch.
      // Navigation carrying that same pair is not a new language/lesson choice.
      const requested = resolveBrowseSelection(pathname, new URLSearchParams(params.toString()), catalog, cloud.profile.selection);
      const previous = cloud.profile.selection;
      selectionIntent.current = explicit && (previous?.language !== requested.language || previous?.lessonId !== requested.lessonId)
        ? { selection: requested, revision: cloud.profile.revision } : null;
    }
    if (cloud.saving || !selectionIntent.current) return;
    const intent = selectionIntent.current;
    selectionIntent.current = null;
    cloud.save({ selection: intent.selection }, intent.revision);
  }, [catalog, cloud, explicit, params, pathname, route]);
  return <BrowseFrame catalog={catalog} selection={selection} scrollPositions={scrollPositions} cloud>{children}</BrowseFrame>;
}

function LegacyBrowseShell({ catalog, children }: ShellProps) {
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
  return <BrowseFrame catalog={catalog} selection={selection} scrollPositions={scrollPositions}>{children}</BrowseFrame>;
}

function BrowseFrame({ catalog, selection, scrollPositions, cloud, children }: ShellProps & {
  selection: BrowseSelection; scrollPositions: Map<string, number>; cloud?: boolean;
}) {
  const pathname = usePathname();
  const preferences = useCloudPreferences();
  const active: BrowseDestination = pathname.startsWith("/settings") ? "settings"
    : pathname.endsWith("/stages") ? "stages" : pathname === "/lessons" ? "lessons" : "languages";
  return <BrowseContext.Provider value={{ catalog, selection, scrollPositions, cloud }}>
    <Page className={styles.page}>
      <LearnerTopNavigation className={styles.header} cloud={cloud} />
      <div className={styles.content}>
        {preferences ? <>
          <Activity mode={preferences.loading ? "hidden" : "visible"}>{children}</Activity>
          {preferences.gate}
        </> : children}
      </div>
      <div className="contents" inert={preferences?.loading}>
      <BottomNavigation active={active} hrefs={{
        languages: browseHref("languages", selection), lessons: browseHref("lessons", selection),
        stages: browseHref("stages", selection), settings: browseHref("settings", selection),
      }} />
      </div>
    </Page>
  </BrowseContext.Provider>;
}
