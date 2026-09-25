import { requireOptionalNativeModule } from 'expo';
import type { WordRange } from '../../src/core/dictionary-words';
import type { DictionaryPort } from '../../src/core/learning-dictionary';

export const dictionary = requireOptionalNativeModule<DictionaryPort & { words(text: string): WordRange[] }>('LearningDictionary');
