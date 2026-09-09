"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { LessonDraftEntry } from "@/lib/lesson-draft-parser";
import { lessonSentenceSections } from "@/lib/lesson-section";
import type { PublishedLesson } from "@/lib/lessons";
import { languageCode } from "@/lib/languages";
import styles from "./practice.module.css";

export function centerCurrentSentence(list: HTMLOListElement) {
  const current = list.querySelector<HTMLButtonElement>('[aria-current="true"]');
  if (!current) return;
  // Keep scrolling inside the list; scrollIntoView can also move the sheet.
  const row = current.getBoundingClientRect();
  const target = list.scrollTop + row.top - list.getBoundingClientRect().top
    - Math.max(0, (list.clientHeight - row.height) / 2);
  // A short final section can leave too little scrollable space to reach the
  // center. Extend only the missing trailing space instead of clamping early.
  const missingSpace = target - (list.scrollHeight - list.clientHeight);
  if (missingSpace > 0) {
    const padding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    list.style.paddingBottom = `${padding + Math.ceil(missingSpace)}px`;
  }
  list.scrollTop = target;
}

export function SentenceList({ lesson, currentPhraseNumbers, onSelect }: {
  lesson: PublishedLesson; currentPhraseNumbers: readonly number[];
  onSelect: (phraseIndex: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const sections = lessonSentenceSections(lesson.entries);
  const openSections = sections.filter(section => section.entries.some(entry =>
    entry.kind === "phrase" && currentPhraseNumbers.includes(entry.phraseNumber)
  )).map(section => section.id);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    if (!list || !current) return;
    current.focus({ preventScroll: true });
    centerCurrentSentence(list);
  }, []);

  return <Accordion type="multiple" defaultValue={openSections} asChild>
    <ol ref={listRef} data-slot="sentence-list" className={styles.sentenceList}>
      {sections.map(section => section.heading ? <AccordionItem key={section.id} value={section.id} asChild>
        <li className={styles.sentenceSection}>
          <AccordionTrigger className={styles.sectionTrigger}>
            <span className={styles.sectionHeading}>
              <span lang={languageCode(lesson.language)}>{section.heading.target}</span>
              {section.heading.korean ? <span lang="ko">{section.heading.korean}</span> : null}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <SentenceRows entries={section.entries} language={lesson.language} currentPhraseNumbers={currentPhraseNumbers} onSelect={onSelect} />
          </AccordionContent>
        </li>
      </AccordionItem> : <li key={section.id} className={styles.sentenceSection}>
        <SentenceRows entries={section.entries} language={lesson.language} currentPhraseNumbers={currentPhraseNumbers} onSelect={onSelect} />
      </li>)}
    </ol>
  </Accordion>;
}

function SentenceRows({ entries, language, currentPhraseNumbers, onSelect }: {
  entries: Exclude<LessonDraftEntry, { kind: "chapter" }>[];
  language: PublishedLesson["language"]; currentPhraseNumbers: readonly number[];
  onSelect: (phraseIndex: number) => void;
}) {
  return <ol className={styles.sectionSentences}>
      {entries.map((entry, index) => entry.kind === "section"
        ? <li key={`separator-${index}`} className={styles.menuSection}><Separator decorative={false} aria-label="구간 경계" /></li>
        : <li key={entry.phraseNumber}>
          <Button type="button" variant="sentence" size="row" className={styles.sentenceChoice} data-selected={currentPhraseNumbers.includes(entry.phraseNumber)} aria-current={currentPhraseNumbers.includes(entry.phraseNumber) ? "true" : undefined}
            aria-label={`${entry.phraseNumber}번 문장 · ${entry.target} · ${entry.korean}`} onClick={() => onSelect(entry.phraseNumber - 1)}>
            <span className={styles.sentenceNumber} aria-hidden="true">{entry.phraseNumber}</span>
            <span className={styles.sentenceCopy}><span lang={languageCode(language)}>{entry.target}</span><small lang="ko">{entry.korean}</small></span>
          </Button>
          <Separator />
        </li>)}
    </ol>;
}
