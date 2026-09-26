/** Original, non-commercial text for offline analysis tests and the Simulator lab. */
export const syntaxPhrases = [{ text: 'Birds fly.\nFish swim.', translation: '새가 날아요. 물고기가 헤엄쳐요.' }];
export function syntaxFixture() {
  return { schemaVersion: 1, language: 'en', encodingType: 'UTF16', complete: true, entryCount: 1,
    entries: [{ phraseNumber: 1, text: 'Birds fly. Fish swim.', status: 'complete', error: null,
      analysis: { language: 'en', sentences: [
        { text: { content: 'Birds fly.', beginOffset: 0 } },
        { text: { content: 'Fish swim.', beginOffset: 11 } },
      ], tokens: [
        ['Birds', 0, 'NOUN', 1, 'NSUBJ'], ['fly', 6, 'VERB', 1, 'ROOT'], ['.', 9, 'PUNCT', 1, 'P'],
        ['Fish', 11, 'NOUN', 4, 'NSUBJ'], ['swim', 16, 'VERB', 4, 'ROOT'], ['.', 20, 'PUNCT', 4, 'P'],
      ].map(([content, beginOffset, tag, headTokenIndex, label]) => ({ text: { content, beginOffset },
        partOfSpeech: { tag }, dependencyEdge: { headTokenIndex, label } })) } }] };
}
