# Regression boundaries during device-first migration

Replace tests when a ticket changes the routed behavior. Do not keep a server-era
expectation by routing the learner around package acquisition or weakening a
security assertion.

- All player levels require a complete, verified lesson package. Use
  `openLearnerPage`, `installStagePackage`, or `installPlayerPackage` for normal
  entry. Tests of the download gate must assert the blocked state themselves.
- Level one records confirmations, position, and completion on the device.
  Inspect `readDeviceJournal` and assert that playback does not need progress or
  audio HTTP. `device-learning.spec.ts` covers offline reload, failed local
  writes, completion deduplication, and account isolation.
- Levels two through eight still use the legacy server player. Keep lease,
  takeover, lost-response recovery, and server journal assertions on these
  levels until their implementation ticket replaces that behavior.
- The global settings drawer persists device-local settings. Its tests must not
  await an automatic preferences PATCH or expect a new settings page. Legacy
  player settings and the retained preferences API have separate tests.
- Dictionary and sentence analysis are package resources. Use
  `packageResources` before acquisition when supplying presentation fixtures.
  When overriding audio bytes, update the fixture manifest's digest, size, and
  MIME type through the same helper; never disable package integrity validation.
- Installed-media failures occur at the media API boundary, not at a download
  route that playback no longer requests. Keep fresh-gesture and retry checks.
- Production registers a neutral offline service worker. Offline tests require
  the production build, not the development server's HMR asset graph.

`test:browser` runs the device/package and presentation suites against disposable
local Supabase, plus the separate non-persistence fixtures. The database CI job
also runs SQL, publication/lifecycle, retained preference/player API boundaries,
and downloaded-media integration tests. Test labels distinguish these boundaries;
they do not imply that every player level has already migrated to local storage.

Run suites using `cloud-ui` sequentially against a given disposable database:
their published lesson IDs are fixed. Parallel shards need separate databases;
different browser-server ports alone do not isolate fixtures.

Keep account authorization, publication/version rejection, fixture privacy,
package integrity, and exact layout assertions strict throughout migration.
