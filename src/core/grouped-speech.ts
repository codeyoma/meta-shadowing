import { speechBubbles } from './speech-bubbles';
type Member = { text: string; translation: string };
/** One narration bubble contains member blocks; complete dialogue pairs retain separate bubbles. */
export function groupedSpeechBubbles(members: readonly Member[]): Member[][] {
  const pairs = members.map(member => speechBubbles(member));
  return pairs.some(group => group.length > 1) ? pairs.flatMap(group => group.map(pair => [pair])) : [pairs.flat()];
}
