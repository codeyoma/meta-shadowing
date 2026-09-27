/** Local migration oracle. Never imported by the app or hosted Swift checks. */
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createSession, createGroupedSession, transition, type Action, type Session } from '../src/core/session';
import { learningUnits, type GroupSize } from '../src/core/learning-units';
import { type PlayableStage } from '../src/core/catalog';
import { ProgressBackupStore } from '../src/core/progress-backup';
import { regroupSession } from '../src/core/regroup-session';
import { revealLines, visibleReveal } from '../src/core/word-reveal';
import { Journal } from '../src/core/journal';
import { levelProgress } from '../src/core/levels';
import { validateProgressBackup } from '../src/core/progress-backup-codec';

function sqliteAdapter(db: DatabaseSync) {
  return {
    exec: (sql: string) => { db.exec(sql); },
    run: (sql: string, ...args: (string | number)[]) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[],
  };
}

const write = process.argv.includes('--write');
if (write === process.argv.includes('--check')) throw Error('Choose exactly one of --write or --check.');
const directory = new URL('../native-ios/Packages/LearningDomain/Tests/LearningDomainTests/Fixtures/', import.meta.url);
const sources = Array.from({ length: 5 }, () => ({ text: 'Hello world.', translation: '안녕하세요.' }));
const plans = [], traces = [];
for (let rawStage = 1; rawStage <= 16; rawStage++) {
  const stage = rawStage as PlayableStage;
  for (const groupSize of [2, 3, 4] as GroupSize[]) {
    const input = { runId: `stage-${stage}-size-${groupSize}`, stage, mode: 'manual' as const, rate: 1 };
    let state: Session = stage >= 7 && stage <= 10
      ? createGroupedSession({ ...input, sourcePhraseCount: 5, groupSize })
      : createSession({ ...input, phraseCount: 5 });
    plans.push({ stage, groupSize, units: learningUnits(sources, stage, groupSize).map(u => u.sourceIndices), defaultCycles: state.planned });
    const initial = state;
    const traceDB = new DatabaseSync(':memory:');
    const journal = new Journal(sqliteAdapter(traceDB), () => new Date('2026-09-27T12:00:00Z'));
    journal.save('sample-v1', state, { language: 'english', book: 'sample' });
    const steps = [];
    for (let unit = 0; unit < initial.phraseCount; unit++) {
      for (let cycle = 0; cycle < initial.planned; cycle++) {
        const events: Action[] = [{ type: 'resume' }, { type: 'audio-position', seconds: 0.2 }, { type: 'audio-ended', durationSeconds: 1 },
          { type: cycle === initial.planned - 1 ? 'next' : 'confirm' }];
        // Silent Confirm performs the single-pass transition itself.
        if (stage >= 11) events[3] = { type: 'confirm' };
        for (const action of events) {
          state = transition(state, action);
          journal.save('sample-v1', state, { language: 'english', book: 'sample' });
          steps.push({ action, state, xp: journal.progress.summary('english').xp });
        }
      }
    }
    traces.push({ stage, groupSize, initial, steps });
    traceDB.close();
  }
}
const db = new DatabaseSync(':memory:');
const adapter = sqliteAdapter(db);
const store = new ProgressBackupStore(adapter, () => new Date('2026-09-27T12:00:00Z'));
db.prepare('UPDATE progress_sync_clock SET writer=?').run('fixturewriter');
const backups = [{ name: 'empty-v4', payload: JSON.parse(store.exportBackup()) }];
let finished = createSession({ runId: 'finished', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
store.journal.save('sample-v1', finished, { language: 'english', book: 'sample' });
for (let cycle = 0; cycle < 3; cycle++) {
  for (const action of [{ type: 'resume' }, { type: 'audio-ended', durationSeconds: 1 }, { type: cycle === 2 ? 'next' : 'confirm' }] as Action[]) {
    finished = transition(finished, action); store.journal.save('sample-v1', finished, { language: 'english', book: 'sample' });
  }
}
// Journal's legacy SQL timestamp default uses the wall clock; pin synthetic evidence explicitly.
db.prepare('UPDATE completions SET completed_at=?').run('2026-09-27 12:00:00');
const modern = JSON.parse(store.exportBackup());
backups.push({ name: 'completed-v4', payload: modern });
for (const version of [2, 3]) {
  const payload = structuredClone(modern); payload.version = version; delete payload.sync;
  if (version === 2) {
    delete payload.tables.unit_credits;
    for (const row of payload.tables.checkpoints) { const state = JSON.parse(row.state); delete state.unitProgress; row.state = JSON.stringify(state); }
  }
  validateProgressBackup(JSON.stringify(payload));
  backups.push({ name: `completed-v${version}`, payload });
}
const legacy = structuredClone(backups.find(b => b.name === 'completed-v2')!.payload);
legacy.version = 1; delete legacy.tables.cycle_credits;
legacy.tables.daily_stages = [{ language: 'english', book: 'sample', day: '2026-09-27', stage: 1 }];
legacy.tables.stage_awards = [{ language: 'english', book: 'sample', run: 'finished', day: '2026-09-27', stage: 1, xp: 10 }];
validateProgressBackup(JSON.stringify(legacy)); backups.push({ name: 'historical-v1', payload: legacy });
for (const stage of [7, 11, 15] as PlayableStage[]) {
  let state = stage === 7 ? createGroupedSession({ runId: 'grouped', stage, sourcePhraseCount: 5, groupSize: 2, mode: 'manual', rate: 1 })
    : createSession({ runId: `silent-${stage}`, stage, phraseCount: 2, mode: 'manual', rate: 1 });
  store.journal.save('sample-v1', state, { language: 'english', book: 'sample' });
  for (const action of [{ type: 'resume' }, { type: 'audio-ended', durationSeconds: 1 }, { type: 'confirm' }] as Action[]) {
    state = transition(state, action); store.journal.save('sample-v1', state, { language: 'english', book: 'sample' });
  }
  if (stage === 7) {
    state = regroupSession(state, 3, 'regrouped'); store.journal.save('sample-v1', state, { language: 'english', book: 'sample' });
  }
}
backups.push({ name: 'grouped-and-silent-v4', payload: JSON.parse(store.exportBackup()) });
db.close();
const regroupings = [];
for (const size of [2, 3, 4] as GroupSize[]) {
  let state = createGroupedSession({ runId: 'run', stage: 7, sourcePhraseCount: 5, groupSize: size, mode: 'manual', rate: 1 });
  state = transition(transition(transition(state, { type: 'resume' }), { type: 'audio-ended', durationSeconds: 1 }), { type: 'confirm' });
  for (const nextSize of [2, 3, 4] as GroupSize[]) {
    if (nextSize !== size) regroupings.push({ size, nextSize, state: regroupSession(state, nextSize, `new-${nextSize}`) });
  }
}
const reveals = [11, 12, 13, 14, 15, 16].flatMap(stage => [0, 0.2, 0.4, 0.8, 3].map(seconds => {
  const phrase = { text: 'Hello,  world!\nAgain.', translation: '안녕 하세요.' };
  const lines = revealLines(phrase, stage);
  return { stage, seconds, phrase, texts: visibleReveal(lines, seconds, 150).map(line => line.visibleText) };
}));
const revision = execFileSync('git', ['log', '-1', '--format=%H', '--', 'src/core'], { encoding: 'utf8' }).trim();
let xp = 0;
const levels = Array.from({ length: 998 }, () => {
  xp += levelProgress(xp).required;
  return { xp, before: levelProgress(xp - 1), after: levelProgress(xp) };
});
for (const [name, fixture] of Object.entries({
  'learning-reference.json': { referenceRevision: revision, plans, traces, regroupings, reveals, levels },
  'backup-reference.json': { referenceRevision: revision, backups },
})) {
  const data = JSON.stringify(fixture, null, 2) + '\n';
  const file = new URL(name, directory);
  if (write) writeFileSync(file, data);
  else if (readFileSync(file, 'utf8') !== data) throw Error(`Stale reference fixture: ${name}`);
}
console.log(write ? 'Synthetic reference fixtures generated.' : 'Synthetic reference fixtures match.');
