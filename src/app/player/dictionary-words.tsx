import { Fragment, useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/lessons";
import { languageCode } from "@/lib/languages";
import { usePackageContent } from "./package-content";
import styles from "./dictionary-popup.module.css";

export type DictionaryWordSelect = (word: string, trigger: HTMLButtonElement) => void;
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function visibleWordSegments(text: string, language: Language) {
  const segments = [...new Intl.Segmenter(languageCode(language), { granularity: "word" }).segment(text)];
  if (language !== "english") return segments;
  const joined: typeof segments = [];
  for (let index = 0; index < segments.length; index++) {
    const part = { ...segments[index] };
    // Join only lexical hyphens between adjacent word parts. Sentence dashes,
    // doubled hyphens and whitespace keep their original boundaries.
    while (part.isWordLike && /^[\-‐‑]$/u.test(segments[index + 1]?.segment ?? "") && segments[index + 2]?.isWordLike) {
      part.segment += segments[index + 1].segment + segments[index + 2].segment;
      index += 2;
    }
    joined.push(part);
  }
  return joined;
}

/** Segment only the permitted visible text; punctuation and spacing stay intact. */
export function DictionaryWords({ text, language, onWordSelect }: {
  text: string; language: Language; onWordSelect?: DictionaryWordSelect;
}) {
  const packageContent = usePackageContent();
  // Browser and server ICU versions can segment Japanese differently. Keep the
  // original text for SSR/hydration, then create word controls in the browser.
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const interactive = hydrated && Boolean(onWordSelect);
  const segments = useMemo(() => interactive
    ? packageContent ? packageContent.manifest.words[text] ?? [{ segment: text, index: 0, isWordLike: false }]
      : visibleWordSegments(text, language)
    : [], [text, language, interactive, packageContent]);
  if (!interactive || !onWordSelect) return text;
  return segments.map(({ segment, index, isWordLike }) => isWordLike && /\p{L}/u.test(segment)
    ? <Button key={index} type="button" variant="ghost" className={styles.word} data-dictionary-word
      aria-label={`${segment} 뜻 보기`} aria-haspopup="dialog"
      onClick={event => onWordSelect(segment, event.currentTarget)}>{segment}</Button>
    : <Fragment key={index}>{segment}</Fragment>);
}
