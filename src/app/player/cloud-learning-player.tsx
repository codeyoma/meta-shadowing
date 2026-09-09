"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isPracticeVerificationCurrent, PracticeError, sendPractice, type CloudJournal, type PracticeCommand, type PracticeLease } from "@/lib/cloud-practice";
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
import { browseHref } from "@/lib/browse-navigation";

type Props = { accountId: string; lesson: PublishedLesson; level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; stage: number; hints: SubtitleHint[]; lines: RapidLine[]; requestedRun?: string };
function ActiveCloudPlayer({ lease, instance, lesson, level, stage, hints, lines, invalidateAccount, restart }: Props & { lease: PracticeLease; instance: string; invalidateAccount: () => void; restart: (lease: PracticeLease) => void }) {
  const { recording, notice } = useCloudRecording(lease,instance,invalidateAccount,restart);
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
  const [takeoverTarget,setTakeoverTarget] = useState<CloudJournal["activeLease"]>(null);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const command = useRef<Extract<PracticeCommand,{action:"start" | "takeover"}> | null>(null);
  const fetching = useRef(false);
  const accountValid = useRef(true);
  const lifecycleEpoch = useRef(0);
  const acceptLease = useCallback((result: PracticeLease) => {
    setLease(result);
    const url = new URL(window.location.href);
    url.searchParams.set("run",result.record.runId);
    url.searchParams.set("level",String(result.record.level));
    url.searchParams.set("stage",String(result.record.stage));
    window.history.replaceState(null,"",url);
  },[]);
  const invalidateAccount = useCallback(() => {
    accountValid.current = false;
    command.current = null;
    setLease(null); setJournal(null); setError("account-changed");
  },[]);
  useEffect(() => {
    const changed = () => { lifecycleEpoch.current++; };
    window.addEventListener("focus",changed); window.addEventListener("offline",changed); document.addEventListener("visibilitychange",changed);
    return () => { window.removeEventListener("focus",changed); window.removeEventListener("offline",changed); document.removeEventListener("visibilitychange",changed); };
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
    setJournal(null);
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void Promise.all([
      fetch("/api/learner/practice", { cache: "no-store",signal:AbortSignal.timeout(15000) }),
      fetch(`/api/learner/preferences?timezone=${encodeURIComponent(timezone)}`, { cache: "no-store",signal:AbortSignal.timeout(15000) }),
    ]).then(async ([response,preferences]) => {
      if (!response.ok || !preferences.ok) {
        if (response.status === 401 || preferences.status === 401) throw new PracticeError("unauthorized");
        const failed = !response.ok ? response : preferences;
        throw new PracticeError((await failed.json()).error);
      }
      const data: CloudJournal = await response.json();
      const {profile} = await preferences.json();
      if (data.accountId !== props.accountId || profile.accountId !== props.accountId) throw new PracticeError("account-changed");
      if (alive && accountValid.current) setJournal(data);
    }).catch(error => {
      if (!alive) return;
      const code = error instanceof PracticeError ? error.code : "temporary-error";
      setError(code === "temporary-error" ? "read-failed" : code);
    });
    return () => { alive = false; };
  },[props.accountId,props.lesson.id,props.lesson.version,props.stage,loadAttempt]);
  const acquire = useCallback(async () => {
    if (fetching.current || !journal || !accountValid.current) return;
    fetching.current = true; setBusy(true); setError(null);
    try {
      const request = command.current!;
      let result = await sendPractice(request);
      // An acquisition receipt can arrive after a different device took over.
      const check = { epoch: lifecycleEpoch.current, startedAt: performance.now() };
      result = await sendPractice({action:"renew",accountId:props.accountId,instance:request.instance,runId:result.record.runId,generation:result.generation});
      if (!accountValid.current) return;
      if (document.hidden || !navigator.onLine || !isPracticeVerificationCurrent(check,lifecycleEpoch.current,performance.now())) throw new PracticeError("temporary-error");
      acceptLease(result);
    } catch(error) {
      if (!accountValid.current) return;
      const code = error instanceof PracticeError ? error.code : "temporary-error";
      setError(code);
      if (code !== "temporary-error") command.current = null;
      if (["session-busy","ownership-lost"].includes(code)) {
        try {
          const response = await fetch("/api/learner/practice",{cache:"no-store",signal:AbortSignal.timeout(10000)});
          if (response.ok) {
            const latest: CloudJournal = await response.json();
            if (latest.accountId !== props.accountId) invalidateAccount();
            else if (accountValid.current) setJournal(latest);
          }
        } catch { /* Keep the last read; its generation is still fenced. */ }
      }
    }
    finally { fetching.current = false; setBusy(false); }
  }, [journal, props.accountId, acceptLease, invalidateAccount]);
  const begin = useCallback(() => {
    command.current ??= { action:"start",accountId:props.accountId,instance:crypto.randomUUID(),operation:crypto.randomUUID(),lessonId:props.lesson.id,lessonVersion:props.lesson.version,level:props.level,stage:props.stage };
    void acquire();
  }, [acquire, props.accountId, props.lesson.id, props.lesson.version, props.level, props.stage]);
  const completed = journal?.history.find(record => record.runId === props.requestedRun);
  const versionChanged = journal?.progress?.lessonId === props.lesson.id
    && Date.parse(journal.progress.lessonVersion) !== Date.parse(props.lesson.version);
  useEffect(() => {
    if (journal && (!journal.activeLease || versionChanged) && !lease && !completed && !error && !busy) begin();
  }, [journal, versionChanged, lease, completed, error, busy, begin]);
  function takeOver() {
    if (fetching.current || !takeoverTarget) return;
    command.current = {action:"takeover",accountId:props.accountId,instance:crypto.randomUUID(),operation:crypto.randomUUID(),runId:takeoverTarget.runId,generation:takeoverTarget.generation};
    setTakeoverTarget(null);
    void acquire();
  }
  if (lease) return <ActiveCloudPlayer key={lease.record.runId} {...props} lease={lease} instance={command.current!.instance} invalidateAccount={invalidateAccount} restart={acceptLease} />;
  return <main className="page mx-auto flex w-full max-w-sm flex-col gap-4 p-5">
    {completed || error || journal?.activeLease ? <h1>{props.lesson.name}</h1> : <div aria-busy="true" aria-label="학습 준비" />}
    {completed ? <CompletionSummary record={completed as CompletionRecord} onHome={() => window.location.assign(browseHref("lessons", { language: props.lesson.language, lessonId: props.lesson.id }))} /> : <>
      {journal?.progress?.lessonId === props.lesson.id && Date.parse(journal.progress.lessonVersion) !== Date.parse(props.lesson.version) ? <p>레슨 버전이 변경되어 이전 진도를 이어갈 수 없습니다. 새 버전의 처음부터 시작합니다. 과거 완료 기록은 유지됩니다.</p> : null}
      {error ? <PracticeFailure error={error} retry={() => journal ? begin() : setLoadAttempt(value => value + 1)} /> : null}
      {journal?.activeLease && journal.progress && (journal.progress.lessonId !== props.lesson.id || Date.parse(journal.progress.lessonVersion) === Date.parse(props.lesson.version)) ? journal.progress.lessonId === props.lesson.id && journal.progress.stage === props.stage ? <Dialog open={Boolean(takeoverTarget)} onOpenChange={open => setTakeoverTarget(open ? journal.activeLease : null)}>
        <DialogTrigger asChild><Button disabled={busy}>이 기기에서 이어 학습</Button></DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>학습 기기를 변경할까요?</DialogTitle>
            <DialogDescription>마지막 서버 확인 지점에서 이어갑니다. 이전 기기는 다음 연결 확인 시 중지되며, 확인되지 않은 학습은 반영되지 않습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTakeoverTarget(null)}>취소</Button>
            <Button onClick={takeOver}>이어 학습 확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> : <Button asChild variant="outline"><a href={`/player?lesson=${journal.progress.lessonId}&level=${journal.progress.level}&stage=${journal.progress.stage}`}>진행 중인 학습으로 이동</a></Button> : null}
    </>}
  </main>;
}
