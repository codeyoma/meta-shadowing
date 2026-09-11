"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActionableDialog, useActionableProblem } from "../actionable-dialog";
import { Button } from "@/components/ui/button";
import { assertDeviceAccess } from "@/lib/device-access";
import { readDeviceLearningState, subscribeDeviceSnapshot, startDeviceRun, saveDeviceRun, type DeviceRun, type DeviceWriter } from "@/lib/device-learning-store";
import type { PublishedLesson } from "@/lib/lessons";
import { groupLessonPhrases } from "@/lib/phrase-groups";
import type { RapidLine } from "@/lib/rapid-session";
import type { SubtitleHint } from "@/lib/practice-tokens";
import { resolveSessionSettings } from "@/lib/session-settings";
import { localStudyDay } from "@/lib/study-streak";
import { useDeviceAccess } from "../device-access-provider";
import { AudioPhrasePlayer } from "./audio-phrase-player";
import { RapidPlayer } from "./rapid-player";
import type { LearningRecording, RecordUpdate } from "./recording-types";

export function LocalSaveFailure({ retry }: { retry: () => void }) {
  const access = useDeviceAccess();
  const retryButton = useRef<HTMLButtonElement>(null);
  useActionableProblem(true, { scope: access?.accountId ?? "local", key: "local-save", title: "기기에 학습을 저장하지 못했습니다.",
    description: "다음 프레이즈로 이동하지 않았습니다. 브라우저 저장 공간을 확인한 뒤 같은 저장을 다시 시도해 주세요. 다른 탭에서 기록이 바뀌었다면 새로고침해 주세요.",
    returnFocus: () => retryButton.current, action: { label: "기기 저장 재시도", run: retry } });
  return <Button ref={retryButton} variant="outline" onClick={retry}>기기 저장 재시도</Button>;
}

const packageAllowed = () => true;
function replaceRunUrl(run: DeviceRun) {
  const url = new URL(location.href);
  url.searchParams.set("level", String(run.level));
  url.searchParams.set("stage", String(run.stage));
  url.searchParams.set("version", run.lessonVersion);
  url.searchParams.set("run", run.runId);
  window.history.replaceState(null, "", url);
}

function CatalogExit({ onExit }: { onExit: () => void }) {
  return <Button type="button" variant="outline" className="fixed top-3 right-3 z-50" onClick={onExit}>다른 다운로드 레슨</Button>;
}

export function LocalLearningPlayer({ lesson, stage, hints = [], lines = [], requestedRun, packageBlocked = false, canUsePackage = packageAllowed, onCatalog }: { lesson: PublishedLesson; stage: number; hints?: SubtitleHint[]; lines?: RapidLine[]; requestedRun?: string; packageBlocked?: boolean; canUsePackage?: () => boolean; onCatalog?: () => void }) {
  const access = useDeviceAccess()!;
  const [run, setRun] = useState<DeviceRun | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [writer, setWriter] = useState<DeviceWriter | null>(null);
  useEffect(() => {
    let alive = true;
    const href = location.href;
    // History can change before async catalog restoration unmounts this player.
    // A late startup belongs to its original URL, not the new history entry.
    const isCurrent = () => alive && location.href === href;
    void readDeviceLearningState(access).then(async ({ writer: loadedWriter }) => {
      if (!isCurrent()) return;
      const value = await startDeviceRun(loadedWriter, lesson, stage, requestedRun);
      if (!isCurrent()) return;
      setWriter(loadedWriter);
      replaceRunUrl(value);
      setRun(value);
    }).catch(() => { if (isCurrent()) setFailed(true); });
    const unsubscribe = subscribeDeviceSnapshot(() => { alive = false; setRun(null); setWriter(null); setFailed(true); });
    return () => { alive = false; unsubscribe(); };
  }, [access, lesson, stage, requestedRun, attempt]);
  if (!run) return <main className="page mx-auto flex w-full max-w-md flex-col gap-4 p-5"><h1>{lesson.name}</h1>
    {onCatalog ? <CatalogExit onExit={onCatalog} /> : null}
    {failed ? <LocalSaveFailure retry={() => { setFailed(false); setAttempt(value => value + 1); }} /> : <p role="status">기기 학습 기록을 읽고 있어요…</p>}
  </main>;
  return <ActiveLocalPlayer key={run.runId} writer={writer!} initial={run} lesson={lesson} hints={hints} lines={lines} packageBlocked={packageBlocked} canUsePackage={canUsePackage} onCatalog={onCatalog} restart={value => {
    replaceRunUrl(value); setRun(value);
  }} />;
}

function ActiveLocalPlayer({ initial, writer: access, lesson, hints, lines, restart, packageBlocked, canUsePackage, onCatalog }: { initial: DeviceRun; writer: DeviceWriter; lesson: PublishedLesson; hints: SubtitleHint[]; lines: RapidLine[]; restart: (run: DeviceRun) => void; packageBlocked: boolean; canUsePackage: () => boolean; onCatalog?: () => void }) {
  const dialogs = useActionableDialog();
  const current = useRef(initial);
  const [record, setRecord] = useState(initial);
  const [status, setStatus] = useState<"ready" | "saving" | "error">("ready");
  const state = useRef(status);
  const alive = useRef(true);
  const clock = useRef({ active: false, anchor: 0, total: initial.activeMs });
  const pending = useRef<{ run: DeviceRun; resolve: () => void; reject: (reason: Error) => void; restart?: boolean; studyDay?: string } | null>(null);
  const inFlight = useRef(false);
  const track = useCallback((active: boolean, elapsedMs = 0) => {
    const now = performance.now(), value = clock.current;
    if (value.active) value.total += Math.max(0, now - value.anchor);
    value.total += elapsedMs; value.anchor = now; value.active = active;
  }, []);
  const change = useCallback((value: typeof status) => { state.current = value; if (alive.current) setStatus(value); }, []);
  const submit = useCallback(async () => {
    if (!pending.current || inFlight.current) return;
    const operation = pending.current;
    inFlight.current = true; change("saving");
    try {
      assertDeviceAccess(access);
      if (!canUsePackage()) throw new Error("Package access ended");
      const base = operation.restart ? await startDeviceRun(access, lesson, operation.run.stage!) : current.current;
      let next = operation.run;
      if (operation.restart) {
        // A completed run may restart after device grouping preferences change.
        // Resolve the selected sentence against the new run's groups, not the
        // old player's unit indexes, and resume from the group's first phrase.
        const groups = base.level === 4 || base.level === 5 ? groupLessonPhrases(lesson.entries, base.settings.groupSize) : [];
        const nextUnit = groups.length ? Math.max(0, groups.findLastIndex(group => group.phrases[0].phraseNumber - 1 <= operation.run.nextPhrase)) : operation.run.nextPhrase;
        const nextPhrase = groups.length ? groups[nextUnit].phrases[0].phraseNumber - 1 : operation.run.nextPhrase;
        next = { ...base, nextPhrase, nextUnit };
      }
      const value = await saveDeviceRun(access, next, base.revision, operation.studyDay);
      assertDeviceAccess(access);
      if (!alive.current) return;
      current.current = value; setRecord(value); pending.current = null;
      state.current = "ready";
      if (operation.restart) restart(value);
      operation.resolve();
      setStatus("ready");
    } catch { change("error"); }
    finally { inFlight.current = false; }
  }, [access, change, lesson, restart, canUsePackage]);
  const canAct = useCallback(() => {
    try { assertDeviceAccess(access); return canUsePackage() && alive.current && state.current === "ready" && !document.hidden; }
    catch { return false; }
  }, [access, canUsePackage]);
  const updateRecord = useCallback((update: RecordUpdate): void | Promise<void> => {
    track(Boolean(update.active) && canAct(), update.elapsedMs);
    if (!update.checkpoint && !update.settings) return;
    if (!canAct() || pending.current) return;
    track(false);
    if (current.current.completedAt) {
      if (update.kind !== "jump" || !update.checkpoint) return;
      const next = { ...current.current, nextPhrase: update.checkpoint.phrase, nextUnit: update.checkpoint.unit };
      return new Promise<void>((resolve, reject) => { pending.current = { run: next, resolve, reject, restart: true }; void submit(); });
    }
    const previous = current.current;
    const next: DeviceRun = { ...previous, activeMs: Math.floor(clock.current.total),
      settings: update.settings ? resolveSessionSettings(update.settings, previous.settings) : previous.settings,
      ...(update.checkpoint ? { nextUnit: update.checkpoint.unit, nextPhrase: update.checkpoint.phrase,
        confirmedCycles: update.kind === "studied" ? update.confirmedCycles ?? previous.confirmedCycles : 0 } : {}),
      ...(update.finished ? { completedAt: new Date().toISOString() } : {}) };
    return new Promise<void>((resolve, reject) => { pending.current = { run: next, resolve, reject,
      ...(update.studied ? { studyDay: localStudyDay(new Date()) } : {}) }; void submit(); });
  }, [access, canAct, lesson, restart, submit, track]);
  useEffect(() => {
    alive.current = true;
    const visibility = () => { if (document.hidden) track(false); };
    const before = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("beforeunload", before);
    return () => {
      alive.current = false; track(false);
      pending.current?.reject(new Error("Local learning was closed")); pending.current = null;
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("beforeunload", before);
    };
  }, [track]);
  const exit = (navigate: () => void) => {
    // Both same-document catalog navigation and player-menu exits consult the
    // live operation, including the interval before saving state renders.
    if (pending.current) {
      dialogs.show({ scope: access.accountId, key: "unsaved-exit", explicit: true, title: "저장하지 못한 변경이 있습니다.",
        description: "나가면 마지막 기기 저장 지점으로 돌아갑니다. 나가시겠어요?", dismissLabel: "계속 학습", action: { label: "나가기", run: navigate } });
      return;
    }
    navigate();
  };
  const recording: LearningRecording = { local: true, completion: record.completedAt ? record as DeviceRun & { completedAt: string } : null,
    blocked: packageBlocked || status !== "ready", canAct, verifyResume: async () => canAct(), updateRecord,
    exit: href => exit(() => window.location.assign(navigator.onLine ? href : "/offline")) };
  const start = useMemo(() => ({ selection: { ...initial.settings, language: lesson.language, lessonId: lesson.id, level: initial.level, stage: initial.stage!, runId: initial.runId },
    progress: initial, completion: null, confirmedCycles: initial.confirmedCycles }), [initial, lesson]);
  const groups = useMemo(() => initial.level === 4 || initial.level === 5 ? groupLessonPhrases(lesson.entries, initial.settings.groupSize) : [], [initial.level, lesson.entries, initial.settings.groupSize]);
  const notice = status === "error" ? <LocalSaveFailure retry={() => void submit()} /> : null;
  return <>
    {onCatalog ? <CatalogExit onExit={() => exit(onCatalog)} /> : null}
    {initial.level === 6 || initial.level === 7 || initial.level === 8 ? <RapidPlayer lesson={lesson} level={initial.level} lines={lines} start={start} cloud={recording} notice={notice}
      settings={initial.settings} /> : <AudioPhrasePlayer lesson={lesson} level={initial.level} hints={hints} groups={groups} start={start} cloud={recording}
    notice={notice}
    settings={{ mode: initial.settings.mode, playbackRate: initial.settings.speed, advanceDelayMs: initial.settings.advanceDelayMs, groupGapMs: initial.settings.groupGapMs }} />}
  </>;
}
