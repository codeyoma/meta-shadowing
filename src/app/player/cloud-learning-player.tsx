"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PracticeError, sendPractice, type CloudJournal, type PracticeCommand, type PracticeLease } from "@/lib/cloud-practice";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { CompletionRecord } from "@/lib/learning-records";
import { AudioPhrasePlayer } from "./audio-phrase-player";
import { PracticeFailure, useCloudRecording } from "./use-cloud-recording";
import { CompletionSummary } from "../completion-summary";
import { groupLessonPhrases } from "@/lib/phrase-groups";
import type { RapidLine } from "@/lib/rapid-session";
import { RapidPlayer } from "./rapid-player";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type Props = { accountId: string; lesson: PublishedLesson; level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; stage: number; hints: SubtitleHint[]; lines: RapidLine[]; requestedRun?: string };
function ActiveCloudPlayer({ lease, instance, lesson, level, stage, hints, lines, invalidateAccount }: Props & { lease: PracticeLease; instance: string; invalidateAccount: () => void }) {
  const { recording, notice } = useCloudRecording(lease,instance,invalidateAccount);
  const start = useMemo(() => ({ selection: { ...lease.record.settings, language: lesson.language, lessonId: lesson.id, level, stage, runId: lease.record.runId }, progress: lease.record, completion: null }), [lease,lesson,level,stage]);
  const groups = useMemo(() => level === 4 || level === 5 ? groupLessonPhrases(lesson.entries,lease.record.settings.groupSize) : [],[lesson,level,lease]);
  if (level === 6 || level === 7 || level === 8) return <RapidPlayer lesson={lesson} level={level} lines={lines} settings={lease.record.settings} start={start} cloud={recording} notice={notice} />;
  return <AudioPhrasePlayer lesson={lesson} level={level} hints={hints} groups={groups} start={start} cloud={recording} notice={notice}
    settings={{ mode: lease.record.settings.mode, playbackRate: lease.record.settings.speed, advanceDelayMs: lease.record.settings.advanceDelayMs, groupGapMs: lease.record.settings.groupGapMs }} />;
}
export function CloudLearningPlayer(props: Props) {
  const [lease,setLease] = useState<PracticeLease | null>(null);
  const [journal,setJournal] = useState<CloudJournal | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const command = useRef<Extract<PracticeCommand,{action:"start"}> | null>(null);
  const fetching = useRef(false);
  const accountValid = useRef(true);
  const invalidateAccount = useCallback(() => {
    accountValid.current = false;
    command.current = null;
    setLease(null); setJournal(null); setError("account-changed");
  },[]);
  useEffect(() => {
    accountValid.current = true;
    const subscription = getBrowserSupabaseClient()?.auth.onAuthStateChange((event: AuthChangeEvent,session: Session | null) => {
      if (event !== "INITIAL_SESSION" && session?.user.id !== props.accountId) invalidateAccount();
    }).data.subscription;
    return () => { accountValid.current = false; subscription?.unsubscribe(); };
  },[props.accountId,invalidateAccount]);
  useEffect(() => {
    const verify = async () => {
      if (!accountValid.current) return;
      try {
        const response = await fetch("/api/learner/practice",{cache:"no-store",signal:AbortSignal.timeout(10000)});
        if (response.status === 401) { invalidateAccount(); return; }
        if (response.ok && (await response.json()).accountId !== props.accountId) invalidateAccount();
        else if (!lease) setLoadAttempt(value => value + 1);
      } catch { /* The active lease/input guard handles network failure. */ }
    };
    window.addEventListener("focus",verify);
    return () => window.removeEventListener("focus",verify);
  },[props.accountId,lease,invalidateAccount]);
  useEffect(() => {
    let alive = true;
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void Promise.all([
      fetch("/api/learner/practice", { cache: "no-store",signal:AbortSignal.timeout(15000) }),
      fetch(`/api/learner/preferences?timezone=${encodeURIComponent(timezone)}`, { cache: "no-store",signal:AbortSignal.timeout(15000) }),
    ]).then(async ([response,preferences]) => {
      if (!response.ok || !preferences.ok) throw new PracticeError(response.status === 401 || preferences.status === 401 ? "unauthorized" : "temporary-error");
      const data: CloudJournal = await response.json();
      const {profile} = await preferences.json();
      if (data.accountId !== props.accountId || profile.accountId !== props.accountId) throw new PracticeError("account-changed");
      if (alive && accountValid.current) setJournal(data);
    }).catch(error => { if (alive) setError(error instanceof PracticeError ? error.code : "temporary-error"); });
    return () => { alive = false; };
  },[props.accountId,props.lesson.id,props.lesson.version,props.stage,loadAttempt]);
  async function begin() {
    if (fetching.current || !journal || !accountValid.current) return;
    fetching.current = true; setBusy(true); setError(null);
    command.current ??= { action:"start",accountId:props.accountId,instance:crypto.randomUUID(),operation:crypto.randomUUID(),lessonId:props.lesson.id,lessonVersion:props.lesson.version,level:props.level,stage:props.stage };
    try {
      const result = await sendPractice(command.current);
      if (!accountValid.current) return;
      setLease(result);
      const url = new URL(window.location.href); url.searchParams.set("run",result.record.runId);
      window.history.replaceState(null,"",url);
    } catch(error) { if (accountValid.current) setError(error instanceof PracticeError ? error.code : "temporary-error"); }
    finally { fetching.current = false; setBusy(false); }
  }
  if (lease) return <ActiveCloudPlayer {...props} lease={lease} instance={command.current!.instance} invalidateAccount={invalidateAccount} />;
  const completed = journal?.history.find(record => record.runId === props.requestedRun);
  return <main className="page">
    <h1>{props.lesson.name}</h1>
    {completed ? <CompletionSummary record={completed as CompletionRecord} onHome={() => window.location.assign("/lessons")} /> : <>
      <p>마지막 서버 확인 지점에서 이어 학습합니다.</p>
      {journal?.progress?.lessonId === props.lesson.id && Date.parse(journal.progress.lessonVersion) !== Date.parse(props.lesson.version) ? <p>레슨 버전이 변경되어 이전 진도를 이어갈 수 없습니다. 새 버전의 처음부터 시작합니다. 과거 완료 기록은 유지됩니다.</p> : null}
      {error ? <PracticeFailure error={error} retry={() => journal ? void begin() : setLoadAttempt(value => value + 1)} /> : null}
      <Button disabled={busy || !journal} onClick={() => void begin()}>계정 학습 시작</Button>
    </>}
  </main>;
}
