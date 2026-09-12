# #42: private packages and email-code sign-in

Status: proposed implementation contract, awaiting owner review. No hosted
authentication, policy, bucket or package changes have been applied by this work.

## Owner-approved scope amendment

The owner selected Supabase for package delivery, explicit in-app downloads to
device-local storage, authenticated private access, and email verification codes.
This narrowly expands #42 beyond its original controlled-sample/no-auth boundary.
Existing hosted data and the local sample's learning history remain protected.
Payments, cloud progress synchronization, public release and other learning
methods remain deferred. The following details are proposed for written review.

## Authentication and authorization

- Provide email entry, send-code, code entry, verify, resend and sign-out actions.
  A successful send is not a successful sign-in. Only verified Supabase sessions
  establish identity. Codes and tokens must never appear in application logs.
- Store the native session in secure OS-backed storage. Invalid, expired or
  rate-limited codes leave the user signed out with an actionable message. Allow
  changing the entered email; stale responses cannot sign in a different request.
- Email verification establishes identity, not ownership. A new server-managed
  package-grant table authorizes specific user/package pairs; clients cannot grant
  themselves access. New accounts receive no private package grant automatically.
  Owner-designated test accounts receive only the explicitly approved grant.
- Keep the bucket private. A narrow server endpoint verifies the caller and its
  grant before issuing short-lived URLs for the immutable manifest and five files.
  The client submits a package/version identifier, never arbitrary bucket paths.
  Expired credentials, missing grants and unknown versions fail closed.
- Use server credentials only on the server. Policies reject anonymous object
  access, client uploads and cross-user grant access. No existing bucket is made
  public and no unrelated policy is relaxed.

Short-lived signed delivery is preferred over a public bucket (no meaningful
access control) or proxying all audio bytes through a custom server (extra cost
and failure surface). Signed URLs are bearer credentials until expiry. An in-app
Download button is the supported acquisition flow, not DRM or a guarantee against
URL replay, copying downloaded files or extraction from a compromised device.

## Account-local state

- Keep the existing sample database and files as the guest scope; never silently
  transfer them into a signed-in account. Preserve guest history for later use.
- Private packages, checkpoints and completion history are isolated by stable
  verified user ID and package/version. Switching accounts cannot display or
  resume the previous account's private content. Settings may remain device-wide.
- Sign-out pauses/checkpoints playback, cancels pending downloads, clears the
  active session and hides that account's data. It does not erase downloaded files
  or history. Returning as the same account restores its local records.
- A previously verified, locally retained identity can study fully installed
  content offline without token refresh or a server acknowledgement on playback.
  Explicit sign-out disables that access. Server revocation blocks new downloads;
  immediate remote revocation of offline copies is not promised in this scope.
- Uninstall/clear-data may lose both content and progress. Reauthentication can
  restore download eligibility, not unsynchronized learning history.

## Package contract and install lifecycle

One source package consists of `audio.zip`, `cover.jpg`, `info.json`, `text.txt`
and `text-syntax.json`. Source files stay unchanged and outside public Git.
A generated versioned manifest records each file's size and SHA-256, metadata,
phrase IDs, and expected extracted audio paths, sizes and hashes.

- Validate metadata and phrase counts before publication. The supplied package
  declares 560 phrases; extraction accepts only validated numbered audio entries.
  Ignore known macOS metadata, reject traversal, absolute paths, symlinks,
  duplicates, unexpected payloads and excessive expansion. Retain syntax data
  locally but do not implement the deferred sentence-analysis feature.
- Download only after an explicit button press. Install into an account-scoped
  staging directory; stream files instead of holding the whole archive in JS.
  Check every download and extracted file before atomically publishing readiness.
- Corrupt data, cancellation, network failure, auth expiry or storage exhaustion
  never mark an incomplete package ready. Retry obtains fresh authorization and
  cannot damage a previously verified installation or another account's data.
- Local removal deletes only the selected package's content; retain its learning
  records. Reinstalling the same version restores the saved unfinished cycle.
  Version changes cannot reinterpret incompatible checkpoints silently.
- Replace hard-coded sample references with an explicit installed-package context
  through catalog, player, audio and journal boundaries. Keep the controlled sample
  available for deterministic offline/failure testing alongside private packages.

## Email delivery prerequisites

Inspect existing Auth email/SMTP configuration before editing it. OTP templates
must expose the verification token and preserve any existing supported link flow.
Use the configured sender if it supports the intended recipients. Supabase's
default sender has team-recipient and rate restrictions; custom SMTP or a plan
change must not be silently purchased or provisioned. Live acceptance requires
an owner-specified test email, real inbox receipt and verification, not an admin
bypass. Never ask the owner to paste a password or service key into chat.

## Proposed test seams and acceptance

1. Auth public actions: send, verify, resend, change email, restore and sign out;
   test failures and stale replies without mocking component internals.
2. Server authorization: anonymous, ungranted, wrong-user and wrong-package
   requests fail; only a valid grant yields the intended immutable file set.
3. Package installation: verified readiness, corruption, archive validation,
   interruption, out-of-space, retry, removal and same-version reinstall.
4. Account-local persistence: guest preservation, user isolation, logout races,
   unfinished-cycle recovery and no duplicate rewards across reinstalls.
5. Native Release acceptance: real OTP receipt; explicit download; relaunch and
   offline playback without Metro or host-wide network disruption; removal and
   reinstall preserve progress. Report simulator and physical-device results
   separately. Existing player, settings and checkpoint suites must remain green.

Run destructive automated policy tests only on a disposable local Supabase
environment. Hosted checks use only owner-designated test accounts and newly
scoped package resources. Publish sanitized outcomes, never private content,
email addresses, credentials, project identifiers or signed URLs.

Implementation starts after this written contract and test seams are approved.
The next artifact is a staged implementation plan, starting with auth and its
delivery prerequisites before private-package installation.
