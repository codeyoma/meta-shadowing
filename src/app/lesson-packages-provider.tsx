"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useActionableProblem, useActionableDialog } from "./actionable-dialog";
import { requestOfflineReadiness } from "./offline-shell-registration";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lesson } from "@/lib/lessons";
import { createLessonPackageDownloader, type PackageDownloadProgress } from "@/lib/lesson-package-downloader";
import { listLessonPackages, subscribePackageChanges, type PackageInventory } from "@/lib/lesson-package-store";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type PackageContext = {
  accountId: string; catalog: Lesson[]; inventory: PackageInventory[]; progress: Record<string, PackageDownloadProgress>;
  loading: boolean; error: boolean; invalid: boolean; revision: number;
  download: (lesson: Pick<Lesson, "id" | "version">) => void; pause: (lessonId: string) => void;
  remove: (lessonId: string) => void; refresh: () => void; invalidate: () => void;
};
const Context = createContext<PackageContext | null>(null);
export const useLessonPackages = () => useContext(Context);

export function LessonPackagesProvider({ accountId, catalog, children }: { accountId: string; catalog: Lesson[]; children: ReactNode }) {
  const dialogs = useActionableDialog();
  const [inventory, setInventory] = useState<PackageInventory[]>([]);
  const [progress, setProgress] = useState<Record<string, PackageDownloadProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [revision, setRevision] = useState(0);
  const valid = useRef(true);
  const readEpoch = useRef(0);
  const downloader = useRef<ReturnType<typeof createLessonPackageDownloader> | null>(null);
  const refresh = useCallback(() => {
    const epoch = ++readEpoch.current;
    void listLessonPackages(accountId).then(rows => {
      if (valid.current && epoch === readEpoch.current) { setInventory(rows); setLoading(false); setError(false); setRevision(value => value + 1); }
    }).catch(() => { if (valid.current && epoch === readEpoch.current) { setLoading(false); setError(true); } });
  }, [accountId]);
  const invalidate = useCallback(() => {
    if (!valid.current) return;
    valid.current = false; readEpoch.current++; setInvalid(true); setInventory([]); setProgress({});
    void downloader.current?.invalidate().catch(() => setError(true));
  }, []);
  useEffect(() => {
    valid.current = true;
    const manager = createLessonPackageDownloader(accountId, (lessonId, state) => {
      if (valid.current) setProgress(previous => ({ ...previous, [lessonId]: state }));
    });
    downloader.current = manager;
    refresh();
    const unsubscribe = subscribePackageChanges(change => {
      if (change.accountId === accountId) { valid.current = false; setInvalid(true); setInventory([]); setProgress({}); manager.dispose(); }
      else if (valid.current) refresh();
    });
    const auth = getBrowserSupabaseClient()?.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event !== "INITIAL_SESSION" && session?.user.id !== accountId) invalidate();
    }).data.subscription;
    window.addEventListener("focus", refresh);
    return () => { valid.current = false; readEpoch.current++; manager.dispose(); unsubscribe(); auth?.unsubscribe(); window.removeEventListener("focus", refresh); };
  }, [accountId, invalidate, refresh]);
  const download = useCallback((lesson: Pick<Lesson, "id" | "version">) => {
    if (valid.current) {
      requestOfflineReadiness();
      void downloader.current?.download(lesson).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (valid.current) dialogs.show({ scope: accountId, key: `download:${lesson.id}`, explicit: true, title: "레슨을 다운로드하지 못했습니다.",
          description: "연결과 저장 공간을 확인한 뒤 다시 받아 주세요.", action: { label: "다시 받기", run: () => download(lesson) } });
      }).finally(refresh);
    }
  }, [accountId, dialogs, refresh]);
  const remove = useCallback((lessonId: string) => {
    if (!valid.current) return;
    void downloader.current?.delete(lessonId).then(() => {
      setProgress(previous => { const next = { ...previous }; delete next[lessonId]; return next; }); refresh();
    }).catch(() => setError(true));
  }, [refresh]);
  return <Context.Provider value={{ accountId, catalog, inventory, progress, loading, error, invalid, revision,
    download, pause: lessonId => downloader.current?.pause(lessonId), remove, refresh, invalidate }}>{children}</Context.Provider>;
}

export function PackageDownloads() {
  const packages = useLessonPackages();
  useActionableProblem(!!packages?.error && !packages.invalid, { scope: packages?.accountId ?? "packages", key: "package-storage", title: "다운로드 저장 공간을 확인하지 못했습니다.",
    description: "저장 공간을 확인한 뒤 다시 시도해 주세요.", action: { label: "다운로드 다시 확인", run: () => packages?.refresh() } });
  if (!packages || packages.invalid) return null;
  const lessons = [...packages.catalog];
  for (const row of packages.inventory) if (!lessons.some(lesson => lesson.id === row.lessonId)) {
    lessons.push({ id: row.lessonId, version: row.version, name: row.name, localizedName: row.name, language: "english", phraseCount: row.total, sectionCount: 0 });
  }
  return <section className="mt-6 flex flex-col gap-4" aria-labelledby="package-downloads-title">
    <h2 id="package-downloads-title">다운로드한 레슨</h2>
    <p className="text-sm text-muted-foreground">레슨 전체를 받아야 학습할 수 있습니다. 브라우저나 기기에서 저장 자료가 삭제되면 다시 받아 주세요. 다운로드 삭제는 학습 기록과 설정을 지우지 않습니다.</p>
    {!lessons.length ? <Empty><EmptyDescription>다운로드할 레슨이 없습니다.</EmptyDescription></Empty> : null}
    {lessons.map(lesson => {
      const stored = packages.inventory.find(row => row.lessonId === lesson.id && row.version === lesson.version);
      const older = packages.inventory.some(row => row.lessonId === lesson.id && row.version !== lesson.version);
      const operation = packages.progress[lesson.id];
      const busy = operation?.state === "acquiring" || operation?.state === "downloading";
      const ready = stored?.state === "ready";
      const hasBytes = !!stored || older;
      const text = busy ? operation.state === "acquiring" ? "레슨 자료 확인 중…" : `${operation.complete} / ${operation.total} 오디오 저장 중…`
        : ready ? "다운로드 완료" : operation?.state === "error" ? operation.error : operation?.state === "paused" ? "다운로드 일시 정지"
          : stored?.state === "partial" ? `${stored.complete} / ${stored.total} 오디오 저장됨` : stored?.state === "damaged" ? "자료가 없거나 손상되었습니다. 다시 받아 주세요."
            : stored?.state === "unauthorized" ? "이 계정으로 다운로드를 확인해 주세요." : older ? "새 버전 다운로드 필요 · 이전 버전 보관 중" : "다운로드 필요";
      const action = stored?.state === "partial" || operation?.state === "paused" ? "이어받기" : operation?.state === "error" || stored?.state === "damaged" ? "다시 받기" : "다운로드";
      return <Card key={lesson.id} role="group" aria-label={`${lesson.name} 다운로드`}>
        <CardHeader><CardTitle>{lesson.name}</CardTitle><CardDescription>{lesson.phraseCount}개 프레이즈 · 전체 자료</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2"><p role="status">{text}</p>
          {busy || stored?.state === "partial" ? <Progress value={operation?.complete ?? stored?.complete ?? 0} max={operation?.total || stored?.total || lesson.phraseCount} aria-label={`${lesson.name} 다운로드 진행률`} /> : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {busy ? <Button variant="outline" onClick={() => packages.pause(lesson.id)} aria-label={`${lesson.name} 다운로드 일시 정지`}>일시 정지</Button>
            : !ready ? <Button disabled={packages.loading || packages.error || !packages.catalog.some(row => row.id === lesson.id)} onClick={() => packages.download(lesson)} aria-label={`${lesson.name} ${action}`}>{action}</Button> : null}
          {hasBytes || busy ? <Button variant="outline" onClick={() => packages.remove(lesson.id)} aria-label={`${lesson.name} 다운로드 삭제`}>삭제</Button> : null}
        </CardFooter>
      </Card>;
    })}
  </section>;
}
