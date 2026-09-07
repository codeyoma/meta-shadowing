"use client";

import { useEffect, useRef, useState } from "react";
import { TextSearch } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import type { PublishedLesson } from "@/lib/lessons";
import { syntaxConnection, syntaxFeatures, syntaxPartLabel, syntaxRelationLabel, type PhraseSyntax, type SentenceAnalysis } from "@/lib/phrase-syntax";
import { CloseIcon } from "../ui";
import styles from "./sentence-analysis-popup.module.css";

type Selection = { phraseNumber: number; trigger: HTMLButtonElement };
type Lookup = { status: "loading" } | { status: "error" } | { status: "unauthorized" } | { status: "loaded"; result: PhraseSyntax };

export function useSentenceAnalysis() {
  const [selection, setSelection] = useState<Selection | null>(null);
  return { selection, open: selection !== null,
    show: (phraseNumber: number, trigger: HTMLButtonElement) => setSelection({ phraseNumber, trigger }),
    close: () => setSelection(null) };
}

export function SentenceAnalysisButton({ onClick, disabled = false }: {
  onClick: (trigger: HTMLButtonElement) => void; disabled?: boolean;
}) {
  return <Button type="button" variant="ghost" size="icon" className={styles.trigger} disabled={disabled}
    title={disabled ? "자막을 표시하면 문장 분석을 볼 수 있어요." : "현재 프레이즈의 문장 분석 보기"}
    aria-label="문장 분석" aria-haspopup="dialog" onClick={event => onClick(event.currentTarget)}>
    <TextSearch aria-hidden="true" />
  </Button>;
}

function AnalyzedSentence({ sentence }: { sentence: SentenceAnalysis }) {
  const [selected, setSelected] = useState(() => Math.max(0, sentence.tokens.findIndex(token => token.partOfSpeech.tag === "VERB")));
  const token = sentence.tokens[selected];
  const features = token ? syntaxFeatures(token) : [];
  return <article className={styles.sentence} aria-label={`문장 ${sentence.sentenceNumber}`}>
    <h3>문장 {sentence.sentenceNumber}</h3>
    <p className={styles.source} lang={sentence.language}>{sentence.text}</p>
    {sentence.status !== "complete" ? <p className={styles.pending} role="status">
      {sentence.status === "failed" ? "아직 분석 결과가 없어요. 관리자의 재분석이 필요해요." : "분석을 준비하고 있어요. 나중에 다시 확인해 주세요."}
    </p> : <>
      <div className={styles.tokens} role="group" aria-label={`문장 ${sentence.sentenceNumber} 단어별 품사`}>
        {sentence.tokens.map((item, index) => item.partOfSpeech.tag === "PUNCT"
          ? <span key={index} className={styles.punctuation} lang={sentence.language}>{item.text.content}</span>
          : <Button key={index} type="button" variant="choice" size="sm" className={styles.token}
            aria-pressed={index === selected} aria-label={`${item.text.content} 분석 보기`}
            data-related={index !== selected && token?.dependencyEdge.headTokenIndex === index}
            onClick={() => setSelected(index)}>
            <span lang={sentence.language}>{item.text.content}</span>
            <small>{syntaxPartLabel(item.partOfSpeech.tag, sentence.language)}</small>
          </Button>)}
      </div>
      {token ? <div className={styles.detail} aria-live="polite" aria-atomic="true">
        <div className={styles.detailHeading}><strong lang={sentence.language}>{token.text.content}</strong><span>{syntaxPartLabel(token.partOfSpeech.tag, sentence.language)}</span></div>
        <dl>
          <div><dt>원형</dt><dd lang={sentence.language}>{token.lemma || token.text.content}</dd></div>
          {features.length ? <div><dt>형태</dt><dd>{features.join(" · ")}</dd></div> : null}
          <div><dt>문장 관계</dt><dd>{syntaxRelationLabel(token.dependencyEdge.label)}</dd></div>
        </dl>
        <p>{syntaxConnection(token, sentence.tokens)}</p>
      </div> : null}
    </>}
  </article>;
}

export function SentenceAnalysisPopup({ lesson, selection, onClose }: {
  lesson: Pick<PublishedLesson, "id" | "name" | "version">; selection: Selection; onClose: () => void;
}) {
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLookup({ status: "loading" });
    const timeout = window.setTimeout(() => {
      if (active) setLookup({ status: "error" });
      controller.abort();
    }, 15_000);
    const query = new URLSearchParams({ version: lesson.version ?? "" });
    fetch(`/api/lessons/${encodeURIComponent(lesson.id)}/syntax/${selection.phraseNumber}?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (response.status === 401) {
          if (active && !controller.signal.aborted) setLookup({ status: "unauthorized" });
          return;
        }
        if (!response.ok) throw new Error("Analysis lookup failed");
        const result = await response.json() as PhraseSyntax;
        if (result.phraseNumber !== selection.phraseNumber || !Array.isArray(result.sentences)) throw new Error("Invalid analysis response");
        if (active && !controller.signal.aborted) setLookup({ status: "loaded", result });
      })
      .catch(() => { if (active && !controller.signal.aborted) setLookup({ status: "error" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [lesson.id, lesson.version, selection.phraseNumber, attempt]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={styles.popup} showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (selection.trigger.isConnected) selection.trigger.focus({ preventScroll: true }); }}>
      <DialogHeader>
        <div className={styles.heading}>
          <DialogTitle>문장 분석</DialogTitle>
          <DialogClose asChild><Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label="문장 분석 닫기"><CloseIcon /></Button></DialogClose>
        </div>
        <DialogDescription>{lesson.name} · {selection.phraseNumber}번 프레이즈<br />단어를 누르면 원형과 문장 속 역할을 볼 수 있어요.</DialogDescription>
      </DialogHeader>
      <div className={styles.body} aria-busy={lookup.status === "loading"}>
        {lookup.status === "loading" ? <Empty role="status"><EmptyDescription>저장된 분석을 불러오고 있어요…</EmptyDescription></Empty>
          : lookup.status === "unauthorized" ? <Alert><AlertDescription>접속이 만료되었어요. 앱에 다시 입장해 주세요.</AlertDescription></Alert>
          : lookup.status === "error" ? <Alert variant="destructive"><AlertDescription>
            <p>분석을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button>
          </AlertDescription></Alert>
          : lookup.result.sentences.length === 0 ? <Empty role="status"><EmptyDescription>이 프레이즈의 저장된 분석이 없어요. 분석이 준비되지 않았거나 레슨이 변경되었을 수 있어요.</EmptyDescription></Empty>
          : lookup.result.sentences.map(sentence => <AnalyzedSentence key={`${selection.phraseNumber}-${sentence.sentenceNumber}`} sentence={sentence} />)}
      </div>
      <p className={styles.note}>Google 자동 분석 · 문맥에 따라 품사나 연결관계가 부정확할 수 있어요.</p>
    </DialogContent>
  </Dialog>;
}
