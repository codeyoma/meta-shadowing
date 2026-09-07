import type { RefObject } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { cn } from "@/lib/utils";
import type { Language } from "../../lib/lessons";
import type { SubtitleHint } from "../../lib/practice-tokens";
import { dialogueTurns } from "../../lib/dialogue-turns";
import { DictionaryWords, type DictionaryWordSelect } from "./dictionary-words";
import styles from "./practice.module.css";

export type PracticeSubtitlesProps = {
  lines: SubtitleHint[];
  language: Language;
  grouped: boolean;
  currentIndex: number;
  highlight: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  currentLineRef: RefObject<HTMLLIElement | null>;
  onWordSelect?: DictionaryWordSelect;
};

function PhraseText({ text, turns, language, conversation, onWordSelect }: { text: SubtitleHint; turns: SubtitleHint[] | null; language: Language; conversation: boolean; onWordSelect?: DictionaryWordSelect }) {
  const lang = language === "english" ? "en" : "ja";
  if (turns) return <ol className={styles.dialogueTurns} aria-label="대화">
    {turns.map((turn, index) => <Bubble key={index} asChild variant="outline" align={index % 2 === 0 ? "start" : "end"} className={styles.dialogueTurn} data-side={index % 2 === 0 ? "left" : "right"}>
      <li><BubbleContent className={styles.dialogueCopy}><span lang={lang}><DictionaryWords text={turn.target} language={language} onWordSelect={onWordSelect} /></span><small lang="ko">{turn.korean}</small></BubbleContent></li>
    </Bubble>)}
  </ol>;
  const copy = <><span lang={lang}><DictionaryWords text={text.target} language={language} onWordSelect={onWordSelect} /></span><small lang="ko">{text.korean}</small></>;
  return conversation ? <Bubble variant="outline" className={styles.dialogueTurn}><BubbleContent className={styles.dialogueCopy}>{copy}</BubbleContent></Bubble> : copy;
}

export function PracticeSubtitles({ lines, language, grouped, currentIndex, highlight, canvasRef, currentLineRef, onWordSelect }: PracticeSubtitlesProps) {
  // These are the already-permitted subtitles, not the full source in hint mode.
  const turns = lines.map(dialogueTurns);
  const conversation = turns.some(Boolean);
  return <Bubble variant={conversation ? "ghost" : "outline"} className={conversation ? styles.dialoguePractice : styles.bubble}>
    <BubbleContent size="lg" className={conversation ? styles.dialogueFrame : styles.bubbleFrame}>
    <div ref={canvasRef} id="practice-subtitles" role="region" aria-label="학습 자막" tabIndex={0}
      className={conversation ? styles.dialogueCanvas : cn(styles.canvas, grouped && styles.groupCanvas)}>
      {grouped ? <ol className={cn(styles.phrases, conversation && styles.dialoguePhrases)} aria-label="묶음 프레이즈">
        {lines.map((text, index) => <li key={index} ref={index === currentIndex ? currentLineRef : undefined} aria-current={highlight && index === currentIndex ? "true" : undefined}>
          <PhraseText text={text} turns={turns[index]} language={language} conversation={conversation} onWordSelect={onWordSelect} />
        </li>)}
      </ol> : <PhraseText text={lines[0]} turns={turns[0]} language={language} conversation={conversation} onWordSelect={onWordSelect} />}
    </div>
    </BubbleContent>
  </Bubble>;
}
