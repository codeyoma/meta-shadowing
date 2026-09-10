"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { assertDeviceAccess } from "@/lib/device-access";
import { listLessonPackages, readLessonPackage, subscribePackageChanges, type InstalledLessonPackage, type PackageInventory } from "@/lib/lesson-package-store";
import { DeviceAccessProvider, useDeviceAccess } from "../device-access-provider";
import { LocalLearningPlayer } from "../player/local-learning-player";
import { PackageContent } from "../player/package-content";
import { LearnerSignOut } from "../learner-sign-out";

export function OfflineLearning() {
  return <DeviceAccessProvider offline><OfflinePackages /></DeviceAccessProvider>;
}
function OfflinePackages() {
  const access = useDeviceAccess()!;
  const [installed, setInstalled] = useState<InstalledLessonPackage | null>(null);
  const [inventory, setInventory] = useState<PackageInventory[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const permitted = useRef(false);
  const canUsePackage = useCallback(() => permitted.current, []);
  const [selection, setSelection] = useState<{ stage: number; requestedRun?: string }>({ stage: 1 });
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const load = async () => {
      const request = ++revision;
      assertDeviceAccess(access);
      const rows = await listLessonPackages(access.accountId);
      assertDeviceAccess(access);
      if (!alive || request !== revision) return;
      setInventory(rows);
      const params = new URL(location.href).searchParams;
      const row = rows.find(value => value.lessonId === params.get("lesson") && value.state === "ready");
      const value = row ? await readLessonPackage(access.accountId, row.lessonId, row.version) : null;
      assertDeviceAccess(access);
      if (!alive || request !== revision) return;
      permitted.current = Boolean(value);
      setInstalled(previous => previous?.sha256 === value?.sha256 ? previous : value);
      setSelection(previous => {
        const stage = params.get("stage") === "2" ? 2 : 1, requestedRun = params.get("run") ?? undefined;
        return previous.stage === stage && previous.requestedRun === requestedRun ? previous : { stage, requestedRun };
      });
      setChecking(false); setFailed(false);
      setLoaded(true);
    };
    const refresh = () => {
      const request = revision + 1;
      void load().catch(() => { if (alive && request === revision) { permitted.current = false; setInstalled(null); setChecking(false); setFailed(true); setLoaded(true); } });
    };
    const unsubscribe = subscribePackageChanges(change => {
      const selectedLesson = new URL(location.href).searchParams.get("lesson");
      if (change.accountId === access.accountId || change.lessonId === selectedLesson) {
        // Fence actions synchronously before async byte/grant validation completes.
        permitted.current = false; setChecking(true);
      }
      refresh();
    });
    refresh(); window.addEventListener("focus", refresh);
    return () => { alive = false; revision++; permitted.current = false; unsubscribe(); window.removeEventListener("focus", refresh); };
  }, [access]);
  if (installed) return <PackageContent.Provider value={installed}><LocalLearningPlayer lesson={installed.manifest.lesson} {...selection} packageBlocked={checking} canUsePackage={canUsePackage} /></PackageContent.Provider>;
  return <main className="page mx-auto flex w-full max-w-md flex-col gap-4 overflow-y-auto p-5">
    <h1>기기 학습</h1>
    <p>다운로드한 레슨으로 레벨 1을 학습합니다. 나머지 레벨은 온라인 연결이 필요합니다.</p>
    {failed ? <Alert><AlertTitle>기기 자료를 읽지 못했습니다.</AlertTitle><AlertDescription>브라우저 저장 공간을 확인하거나 온라인에서 레슨을 다시 다운로드해 주세요.</AlertDescription></Alert> : null}
    {!loaded ? <p role="status">기기 자료를 확인하고 있어요…</p> : inventory.filter(row => row.state === "ready").length === 0 ? <p role="status">학습 가능한 전체 레슨이 없습니다. 온라인에서 다운로드해 주세요.</p> : null}
    {inventory.filter(row => row.state === "ready").map(row => <Button key={`${row.lessonId}:${row.version}`} asChild variant="outline"><a href={`/offline?lesson=${encodeURIComponent(row.lessonId)}&level=1`}>{row.name} · 레벨 1</a></Button>)}
    <LearnerSignOut />
    <Button asChild variant="outline"><a href="/lessons">온라인 레슨 목록</a></Button>
  </main>;
}
