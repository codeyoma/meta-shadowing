"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import type { DictionaryEntry } from "@/lib/dictionary";
import type { Language } from "@/lib/lessons";
import { CloseIcon } from "../ui";
import type { DictionaryWordSelect } from "./dictionary-words";
import styles from "./dictionary-popup.module.css";

type Selection = { word: string; trigger: HTMLButtonElement };
type LookupState = { status: "loading" } | { status: "error" } | { status: "loaded"; entries: DictionaryEntry[] };

export function useDictionaryPopup() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const openWord: DictionaryWordSelect = (word, trigger) => setSelection({ word, trigger });
  return { selection, open: selection !== null, openWord, close: () => setSelection(null) };
}

export function DictionaryPopup({ selection, language, onClose }: {
  selection: Selection; language: Language; onClose: () => void;
}) {
  const [lookup, setLookup] = useState<LookupState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const targetLanguage = language === "english" ? "en" : "ja";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLookup({ status: "loading" });
    const timeout = window.setTimeout(() => {
      if (active) setLookup({ status: "error" });
      controller.abort();
    }, 15_000);
    const query = new URLSearchParams({ language, word: selection.word });
    fetch(`/api/dictionary?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Dictionary lookup failed");
        const result = await response.json() as { entries?: DictionaryEntry[] };
        if (!Array.isArray(result.entries)) throw new Error("Invalid dictionary response");
        if (active && !controller.signal.aborted) setLookup({ status: "loaded", entries: result.entries });
      })
      .catch(() => { if (active && !controller.signal.aborted) setLookup({ status: "error" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [language, selection.word, attempt]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={styles.popup} showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (selection.trigger.isConnected) selection.trigger.focus({ preventScroll: true });
      }}>
      <DialogHeader>
        <div className={styles.heading}>
          <DialogTitle><span lang={targetLanguage}>{selection.word}</span> 뜻</DialogTitle>
          <DialogClose asChild><Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label="사전 닫기"><CloseIcon /></Button></DialogClose>
        </div>
        <DialogDescription>한국어 위키낱말사전의 뜻을 확인하세요.</DialogDescription>
      </DialogHeader>
      <div className={styles.body} aria-busy={lookup.status === "loading"}>
        {lookup.status === "loading" ? <Empty role="status"><EmptyDescription>뜻을 찾고 있어요…</EmptyDescription></Empty> : lookup.status === "error" ? <Alert variant="destructive"><AlertDescription>
          <p>뜻을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button>
        </AlertDescription></Alert> : lookup.entries.length === 0 ? <Empty role="status"><EmptyDescription>등록된 한국어 뜻이 없어요. 원문 사전에서 확인해 보세요.</EmptyDescription></Empty> : lookup.entries.map((entry, index) => <article key={`${entry.headword}-${entry.pos}-${index}`} className={styles.entry}>
          <h3><span lang={targetLanguage}>{entry.headword}</span>{entry.pos ? <small>{entry.pos}</small> : null}</h3>
          {entry.matchType === "lemma" ? <p className={styles.pronunciation}><span lang={targetLanguage}>{selection.word} → {entry.headword}</span> · 원형 후보</p> : null}
          {entry.pronunciations?.length ? <p className={styles.pronunciation}>{entry.pronunciations.map(item => item.ipa).join(" · ")}</p> : null}
          <ol className={styles.senses}>
            {entry.senses.map((sense, senseIndex) => <li key={senseIndex}>
              {sense.glosses.map((gloss, glossIndex) => <p key={glossIndex} lang="ko">{gloss}</p>)}
              {sense.examples?.map((example, exampleIndex) => <blockquote key={exampleIndex} className={styles.example}>
                <p lang={targetLanguage}>{example.text}</p>
                {example.translation ? <p lang="ko">{example.translation}</p> : null}
              </blockquote>)}
            </li>)}
          </ol>
          <p className={styles.source}><a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">위키낱말사전 원문</a> · {entry.license}</p>
        </article>)}
      </div>
      <p className={styles.attribution}>
        <a href={`https://ko.wiktionary.org/wiki/${encodeURIComponent(selection.word)}`} target="_blank" rel="noopener noreferrer">위키낱말사전</a> 기여자
        {" · "}<a href="https://kaikki.org/kowiktionary/" target="_blank" rel="noopener noreferrer">Kaikki</a>에서 발췌·가공
        {" · "}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
      </p>
    </DialogContent>
  </Dialog>;
}
