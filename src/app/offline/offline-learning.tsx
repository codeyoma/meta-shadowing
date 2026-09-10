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
import { learningStages } from "@/lib/learning-stages";
import { readDeviceLearningRecord, type DeviceLearningRecord } from "@/lib/device-learning-store";

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
  const [record, setRecord] = useState<DeviceLearningRecord | null>(null);
  const permitted = useRef(false);
  const canUsePackage = useCallback(() => permitted.current, []);
  const [selection, setSelection] = useState<{ stage: number; requestedRun?: string }>({ stage: 1 });
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const load = async () => {
      const request = ++revision;
      assertDeviceAccess(access);
      const [rows, journal] = await Promise.all([listLessonPackages(access.accountId), readDeviceLearningRecord(access.accountId)]);
      assertDeviceAccess(access);
      if (!alive || request !== revision) return;
      setInventory(rows); setRecord(journal);
      const params = new URL(location.href).searchParams;
      const lessonId = params.get("lesson"), requestedRun = params.get("run") ?? undefined;
      const saved = requestedRun ? [...(journal?.runs ?? []), ...(journal?.history ?? [])]
        .find(value => value.runId === requestedRun && value.lessonId === lessonId) : undefined;
      const version = params.get("version") ?? saved?.lessonVersion;
      const row = version ? rows.find(value => value.lessonId === lessonId && value.version === version && value.state === "ready") : undefined;
      const value = row ? await readLessonPackage(access.accountId, row.lessonId, row.version) : null;
      assertDeviceAccess(access);
      if (!alive || request !== revision) return;
      permitted.current = Boolean(value);
      setInstalled(previous => previous?.sha256 === value?.sha256 ? previous : value);
      setSelection(previous => {
        const requestedStage = Number(params.get("stage"));
        const stage = Number.isInteger(requestedStage) && requestedStage >= 1 && requestedStage <= learningStages.length ? requestedStage : 1;
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
    refresh(); window.addEventListener("focus", refresh); window.addEventListener("device-learning-changed", refresh);
    return () => { alive = false; revision++; permitted.current = false; unsubscribe(); window.removeEventListener("focus", refresh); window.removeEventListener("device-learning-changed", refresh); };
  }, [access]);
  const choose = useCallback(async (row: PackageInventory, stage: number) => {
    permitted.current = false; setChecking(true);
    try {
      assertDeviceAccess(access);
      const value = await readLessonPackage(access.accountId, row.lessonId, row.version);
      assertDeviceAccess(access);
      if (!value) throw new Error("Installed package is unavailable");
      const url = new URL(location.href);
      url.searchParams.set("lesson", row.lessonId); url.searchParams.set("version", row.version); url.searchParams.set("stage", String(stage)); url.searchParams.delete("run");
      window.history.pushState(null, "", url);
      permitted.current = true; setInstalled(value); setSelection({ stage }); setFailed(false);
    } catch { setInstalled(null); setFailed(true); }
    finally { setChecking(false); }
  }, [access]);
  if (installed) return <PackageContent.Provider value={installed}>
    <LocalLearningPlayer lesson={installed.manifest.lesson} hints={installed.manifest.hints} lines={installed.manifest.lines}
      {...selection} packageBlocked={checking} canUsePackage={canUsePackage} onCatalog={() => {
        permitted.current = false; window.history.pushState(null, "", "/offline"); setInstalled(null); setSelection({ stage: 1 });
      }} />
  </PackageContent.Provider>;
  return <main className="page mx-auto flex w-full max-w-md flex-col gap-4 overflow-y-auto p-5">
    <h1>기기 학습</h1>
    <p>다운로드한 전체 레슨의 16개 스테이지를 오프라인으로 학습합니다.</p>
    {failed ? <Alert><AlertTitle>기기 자료를 읽지 못했습니다.</AlertTitle><AlertDescription>브라우저 저장 공간을 확인하거나 온라인에서 레슨을 다시 다운로드해 주세요.</AlertDescription></Alert> : null}
    {!loaded ? <p role="status">기기 자료를 확인하고 있어요…</p> : inventory.filter(row => row.state === "ready").length === 0 ? <p role="status">학습 가능한 전체 레슨이 없습니다. 온라인에서 다운로드해 주세요.</p> : null}
    {inventory.filter(row => row.state === "ready").map(row => <section key={`${row.lessonId}:${row.version}`} className="flex flex-col gap-2" aria-label={`${row.name} ${row.version} 스테이지`}>
      <h2>{row.name}</h2>
      <p className="text-xs text-muted-foreground">게시 버전 <time dateTime={row.version}>{row.version}</time></p>
      <div className="grid grid-cols-2 gap-2">{learningStages.map(item => {
        const active = record?.runs.find(run => run.lessonId === row.lessonId && run.lessonVersion === row.version && run.stage === item.stage);
        const completed = record?.history.filter(run => run.lessonId === row.lessonId && run.lessonVersion === row.version && run.stage === item.stage).length ?? 0;
        const unit = active ? item.level >= 6 ? `문장 ${active.nextUnit + 1}` : item.level >= 4 ? `묶음 ${active.nextUnit + 1}` : `프레이즈 ${active.nextPhrase + 1}` : null;
        const status = [active ? `이어서 · ${unit}` : null, completed ? `완료 ${completed}회` : null].filter(Boolean).join(" · ");
        return <Button key={item.stage} asChild variant="outline">
          <a className="h-auto flex-col items-start" href={`/offline?lesson=${encodeURIComponent(row.lessonId)}&version=${encodeURIComponent(row.version)}&stage=${item.stage}`}
            onClick={event => { event.preventDefault(); void choose(row, item.stage); }}>
            <span>스테이지 {item.stage} · Lv {item.level}</span>{status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
          </a>
        </Button>;
      })}</div>
    </section>)}
    <LearnerSignOut />
    <Button asChild variant="outline"><a href="/lessons">온라인 레슨 목록</a></Button>
  </main>;
}
