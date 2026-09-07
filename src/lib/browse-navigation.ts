import type { Language, Lesson } from "./lessons";

export type BrowseDestination = "languages" | "lessons" | "stages" | "settings";
export type BrowseSelection = { language: Language; lessonId: string | null };
export const BROWSE_SELECTION_KEY = "meta-shadowing:browse-selection:v1";

export function resolveBrowseSelection(pathname: string, query: URLSearchParams, catalog: Lesson[], saved?: Partial<BrowseSelection> | null): BrowseSelection {
  const routeId = pathname.match(/^\/lessons\/([^/]+)\/stages$/)?.[1];
  const routeLesson = catalog.find(item => encodeURIComponent(item.id) === routeId);
  const requested = catalog.find(item => item.id === query.get("lesson"));
  const queryLanguage = query.get("language");
  const language: Language = routeLesson?.language ?? (queryLanguage === "english" || queryLanguage === "japanese"
    ? queryLanguage : requested?.language ?? (saved?.language === "japanese" ? "japanese" : "english"));
  const candidates = catalog.filter(item => item.language === language);
  const lesson = routeLesson ?? candidates.find(item => item.id === requested?.id)
    ?? candidates.find(item => item.id === saved?.lessonId) ?? candidates[0];
  return { language, lessonId: lesson?.id ?? null };
}

export function stageHref(lessonId: string, stage?: number): string {
  return `/lessons/${encodeURIComponent(lessonId)}/stages${stage ? `?stage=${stage}` : ""}`;
}

export function browseHref(destination: BrowseDestination | "session", selection: BrowseSelection): string {
  if (destination === "stages" && selection.lessonId) return stageHref(selection.lessonId);
  const query = new URLSearchParams({ language: selection.language });
  if (selection.lessonId) query.set("lesson", selection.lessonId);
  const path = destination === "session" ? "settings/session" : destination === "stages" ? "lessons" : destination;
  return `/${path}?${query}`;
}
