type SpeechPair = { text: string; translation: string };

/** Split only a complete sequence of quoted utterances, never punctuation inside one. */
function quotedUtterances(value: string): string[] | null {
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|“([^”]*)”/g;
  const parts: string[] = [];
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    if (value.slice(end, match.index).trim()) return null;
    const part = (match[1] ?? match[2] ?? '').trim();
    if (!part) return null;
    parts.push(part);
    end = match.index + match[0].length;
  }
  return parts.length && !value.slice(end).trim() ? parts : null;
}

/** Presentation only: no changes to phrase boundaries, audio, or checkpoints. */
export function speechBubbles(phrase: SpeechPair): SpeechPair[] {
  const text = quotedUtterances(phrase.text);
  const translation = quotedUtterances(phrase.translation);
  // Do not guess translation alignment or discard unmatched content.
  if (!text || !translation || text.length !== translation.length) return [phrase];
  return text.map((utterance, index) => ({ text: utterance, translation: translation[index]! }));
}
