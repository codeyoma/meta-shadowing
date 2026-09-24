# Shared package browsing state

Library and stage tabs subscribe to one application-lifetime material snapshot
per immutable package descriptor. Switching tabs, remounting a card, or entering
edit mode does not read files or refresh purchases. Initial state is unknown,
not a false claim that a package is absent.

The snapshot is hydrated on first use. App foreground return reconciles tracked
packages. Install/download/delete operations publish their busy state and refresh
the shared snapshot after completion, including failure and cancellation. Native
delivery is polled only while downloading, installing, cancelling or clearing a
cache; polling is not owned by a focused card. Reads are coalesced, and mutations
wait for outstanding file reads. Existing button appearance survives quiet
reconciliation while interactions are blocked.

This is a presentation cache, not a second durable source of truth. Existing
native package manifests and files remain persistent across launches. StoreKit
remains the entitlement authority through its current-entitlement checks and
native change events. A persisted JavaScript `owned` or `installed` boolean would
be insufficient after revocation, deletion, corruption or a package-version
change. Entitlement and file state stay separate: revoked access blocks study,
but the owner can still inspect and delete downloaded materials.

Actual player entry and direct text/options routes retain fresh native access
and material validation. Cached browsing state never grants access to source
text or bypasses missing-file detection. Progress stays in its existing journal;
material deletion does not delete learning records.

React consumers use stable snapshots through `useSyncExternalStore`, matching
the existing native entitlement subscription pattern. No new state library or
duplicate on-disk status database is needed.

References: [React external-store subscriptions](https://react.dev/reference/react/useSyncExternalStore),
[StoreKit transaction updates](https://developer.apple.com/documentation/storekit/transaction/updates),
and [current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements).
