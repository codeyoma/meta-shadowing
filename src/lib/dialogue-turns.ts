import type { SubtitleHint } from "./practice-tokens";

// Target-language quote lines identify turns; translation punctuation can vary.
export function dialogueTurns(text: SubtitleHint): SubtitleHint[] | null {
  const target = text.target.trim().split(/\r?\n/).map(line => line.trim());
  const korean = text.korean.trim().split(/\r?\n/).map(line => line.trim());
  const quoted = (line: string) => /^["“”].+["“”]$/u.test(line);
  if (target.length < 2 || target.length !== korean.length || !target.every(quoted) || korean.some(line => !line)) return null;
  return target.map((line, index) => ({ target: line, korean: korean[index] }));
}
