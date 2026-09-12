# Private progress transport

Local Expo module, iOS 26+. `index.ts` exports the optional native adapter:
`account`, `list`, `read`, `publish`, `stop`, and the payload-free `accountChanged`
event. Missing module/configuration returns `unavailable`; local learning remains usable.

Set `APPLE_CLOUDKIT_CONTAINER` only in ignored local build configuration after the
owner confirms a container. `APPLE_CLOUDKIT_ENVIRONMENT` defaults to `Development`;
`Production` must be selected explicitly for the corresponding signed distribution
build. The plugin emits matching CloudKit environment and push entitlements and
Info.plist metadata. Verify the final signed app's entitlements against that metadata
before a cloud test or distribution. Production schema deployment is a separate action.
The module does not require an embedded provisioning profile in distributed apps.

Actual account access is disabled on Simulator. Unsigned controlled tests compile
the real CloudKit transport and replace only its external service; they are not
evidence of server acceptance. A configured, correctly signed physical build is
required for the real iCloud account/upload/recovery acceptance test.

`account()` queries identity without creating a sync engine or scheduling work.
The opaque local scope includes container, environment, and current CloudKit user.
`list()` must complete an initial fetch successfully; damaged/missing referenced
metadata never counts as an empty account. A damaged current asset can be listed
and explicitly rejected by `read()` while its previous generation stays selectable.
The domain decoder must validate returned JSON before importing learning data.

Only explicit `publish()` enables a CKSyncEngine send. Automatic engine scheduling
is disabled, including on reopen. The coordinator supplies its one-minute routine
schedule and explicit retry/lifecycle flushes; this module does not promise delivery
after force-quit. `stop()` invalidates delivery and cancels the engine. Every cloud
operation and record batch verifies account scope again after suspension.

Publication persists a random immutable generation and exact UTF-8 bytes first,
uploads its asset, then advances this installation writer's head with server system
fields. Only head acknowledgement resolves publication. Retried older pending work
finishes before newer submitted bytes; numeric revisions are never assumed globally
monotonic. Identical revision with different JSON creates a different generation.
Unexpected head conflicts preserve data and return `progress-cloud-conflict`.

Atomic metadata, pending generations, saved record system fields, sync engine state,
and copied assets live in account-scoped Application Support. Assets are limited to
16 MiB each. Staging is bounded to 128 MiB and 256 metadata records per scope; reaching
these bounds pauses backup instead of deleting other writers or recovery assets.
Only proven superseded assets of this installation writer enter durable cleanup after
head acknowledgement. Current/previous references from every known head are protected.
Cleanup retries at most 16 candidates per publication; failure keeps candidates durable.
The transport never erases learning history or deletes cloud data to make quota space.

Errors use fixed `progress-cloud-` codes: `unavailable`, `accountChanged`, `offline`,
`quota`, `permission`, `conflict`, `corrupt`, `tooLarge`, `storage`, and `busy`.
No raw CloudKit errors, account identifiers, or progress payloads are logged.

Controlled tests: generate `tests/cloudkit/project.yml` using XcodeGen, then run
the `ProgressCloudTests` scheme on an iOS 26+ Simulator. The test host has a fictional
bundle identifier and no iCloud entitlements. The config plugin tests use only
`iCloud.com.example.progress`.
