import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { Journal } from './journal';
import * as learning from './learning-context';
import * as overview from './stage-overview';
import * as catalog from './catalog';
import * as video from './video-package';
import type { useBookRecords } from '../components/use-book-records';

test('stage listing exposes every supported video stage and keeps all audio stages', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = new Journal({ exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null });
    const code = ts.transpileModule(readFileSync(new URL('../components/use-book-records.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    for (const kind of ['video', 'audio']) {
      const state: unknown[] = []; let cursor = 0;
      const effects: (() => unknown)[] = [];
      const module = { exports: {} as { useBookRecords: typeof useBookRecords } };
      runInNewContext(code, { module, exports: module.exports, require: (name: string) => {
        const dependencies: Record<string, unknown> = {
          react: { useCallback: (fn: unknown) => fn, useState: (initial: unknown) => {
            const index = cursor++; if (!(index in state)) state[index] = initial;
            return [state[index], (value: unknown) => { state[index] = value; }];
          } },
          'expo-router': { useFocusEffect: (fn: () => unknown) => { effects.push(fn); } },
          'react-native': { Alert: { alert: () => assert.fail('Could not load records') } },
          '@/native/journal': { getJournal: () => journal },
          '@/native/progress-sync': { getProgressSync: () => ({ getSnapshot: () => ({ learningAvailable: true }), subscribe: () => () => {} }) },
          '@/native/stage-access': { testStageAccess: async () => true },
          '@/core/learning-context': learning, '@/core/stage-overview': overview, '@/core/catalog': catalog,
          '@/core/video-package': video,
        };
        if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
        return dependencies[name];
      } });
      const pack = { language: 'english', manifest: { id: 'video-practice', version: 1, title: 'Generated practice',
        ...(kind === 'video' ? { kind: 'video' } : {}), phrases: [{ text: 'Hello.', translation: '안녕.' }] } } as learning.LearningPackage;
      module.exports.useBookRecords(pack);
      const cleanup = effects[0]!() as () => void;
      await Promise.resolve();
      cursor = 0;
      const result = module.exports.useBookRecords(pack);
      assert.deepEqual(Array.from(result.records!, r => r.stage),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      assert.equal(result.bypass, true);
      cleanup();
    }
  } finally { db.close(); }
});
