import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ActionableDialogProvider } from "./actionable-dialog";
import { LessonPackagesProvider, PackageDownloads } from "./lesson-packages-provider";
const fixture = vi.hoisted(() => ({ reject: (_error: Error) => {} }));
vi.mock("@/lib/lesson-package-store", () => ({ listLessonPackages: async () => [], subscribePackageChanges: () => () => {} }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabaseClient: () => null }));
vi.mock("@/lib/lesson-package-downloader", () => ({ createLessonPackageDownloader: (_account: string, progress: (id: string, value: { state: string; complete: number; total: number }) => void) => ({
  download: () => { progress("lesson", { state: "downloading", complete: 1, total: 2 }); return new Promise((_resolve, reject) => { fixture.reject = reject; }); },
  pause: () => { progress("lesson", { state: "paused", complete: 1, total: 2 }); fixture.reject(new DOMException("Aborted", "AbortError")); },
  delete: async () => { fixture.reject(new DOMException("Aborted", "AbortError")); },
  dispose: () => {}, invalidate: async () => {},
}) }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
for (const action of ["pause", "delete", "failure"] as const) it(`keeps intentional ${action} distinct from a real download failure`, async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  const lesson = { id: "lesson", version: "one", name: "Book", localizedName: "Book", language: "english" as const, phraseCount: 2, sectionCount: 0 };
  await act(async () => root.render(<ActionableDialogProvider><LessonPackagesProvider accountId="account" catalog={[lesson]}><PackageDownloads /></LessonPackagesProvider></ActionableDialogProvider>));
  await act(async () => (node.querySelector('[aria-label="Book 다운로드"] button[aria-label="Book 다운로드"]') as HTMLButtonElement).click());
  expect(node.textContent).toContain("1 / 2 오디오 저장 중");
  await act(async () => {
    if (action === "failure") fixture.reject(new Error("Network failed"));
    else (node.querySelector(`[aria-label="Book 다운로드 ${action === "pause" ? "일시 정지" : "삭제"}"]`) as HTMLButtonElement).click();
  });
  if (action === "failure") expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("레슨을 다운로드하지 못했습니다.");
  else {
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(node.textContent).toContain(action === "pause" ? "다운로드 일시 정지" : "다운로드 필요");
  }
});
