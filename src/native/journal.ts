import type { Journal } from '../core/journal';
import { getProgressSync } from './progress-sync';

export function getJournal(): Journal {
  return getProgressSync().profiles.current().journal;
}
