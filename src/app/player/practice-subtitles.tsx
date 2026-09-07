import type { ReactNode, RefObject } from "react";
import type { Language } from "../../lib/lessons";
import type { SubtitleHint } from "../../lib/practice-tokens";
import { dialogueTurns } from "../../lib/dialogue-turns";
import styles from "./practice.module.css";

export type PracticeSubtitlesProps = {
  lines: SubtitleHint[];
  language: Language;
  grouped: boolean;
  currentIndex: number;
  highlight: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  currentLineRef: RefObject<HTMLLIElement | null>;
  playback: ReactNode;
};

function PhraseText({ text, turns, language, conversation }: { text: SubtitleHint; turns: SubtitleHint[] | null; language: Language; conversation: boolean }) {
  const lang = language === "english" ? "en" : "ja";
  if (turns) return <ol className={styles.dialogueTurns} aria-label="대화">
    {turns.map((turn, index) => <li key={index} className={styles.dialogueTurn} data-side={index % 2 === 0 ? "left" : "right"}>
      <span lang={lang}>{turn.target}</span><small lang="ko">{turn.korean}</small>
    </li>)}
  </ol>;
  const copy = <><span lang={lang}>{text.target}</span><small lang="ko">{text.korean}</small></>;
  return conversation ? <div className={styles.dialogueTurn}>{copy}</div> : copy;
}

export function PracticeSubtitles({ lines, language, grouped, currentIndex, highlight, canvasRef, currentLineRef, playback }: PracticeSubtitlesProps) {
  // These are the already-permitted subtitles, not the full source in hint mode.
  const turns = lines.map(dialogueTurns);
  const conversation = turns.some(Boolean);
  return <div className={conversation ? styles.dialoguePractice : styles.bubble}>
    {playback}
    <div ref={canvasRef} id="practice-subtitles" role="region" aria-label="학습 자막" tabIndex={0}
      className={conversation ? styles.dialogueCanvas : `${styles.canvas} ${grouped ? styles.groupCanvas : ""}`}>
      {grouped ? <ol className={`${styles.phrases} ${conversation ? styles.dialoguePhrases : ""}`} aria-label="묶음 프레이즈">
        {lines.map((text, index) => <li key={index} ref={index === currentIndex ? currentLineRef : undefined} aria-current={highlight && index === currentIndex ? "true" : undefined}>
          <PhraseText text={text} turns={turns[index]} language={language} conversation={conversation} />
        </li>)}
      </ol> : <PhraseText text={lines[0]} turns={turns[0]} language={language} conversation={conversation} />}
    </div>
  </div>;
}
