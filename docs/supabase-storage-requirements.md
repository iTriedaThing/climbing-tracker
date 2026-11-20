# Resilient storage requirements

Status: requirements draft; no application or Supabase changes implemented.
Date: November 12, 2026.

## Objective and scope

Make climbing records recoverable after loss of a phone, removal of the installed app, or clearing browser storage, without relying on remembering manual downloads. Preserve the existing logging, session, ordering, outcome, goal, and backup behavior.

User decisions confirmed:

- Use an emailed sign-in code for the tracker.
- Use a separate Supabase project for climbing-tracker; do not use the existing cragshare project.
- Hard constraint: $0 recurring operating cost. Use free-tier services only; do not enable paid plans, add-ons, or services that require recurring payments.
- Automatically send every save/change to Supabase. Scheduled backups and historical recovery are not required for the initial release. A 90-day historical window remains a preference only if a future solution fits the $0 constraint.
- Keep the complete current climbing history indefinitely unless the owner deletes it, subject to provider limits and lifecycle policies; historical retention must never expire old climbs.
- User-reported JSON backup sizes: 3 KB on August 18, 63 KB on October 22, and 105 KB on November 12, 2026. Expected dataset is a few hundred KB to a few dozen MB over time. These are reported export sizes, not measured database usage.

The only intended interface changes are authentication, migration, sync status, and wording needed to distinguish local cache operations from cloud data operations. No new climbing features, public profiles, sharing, or native-app rewrite are in scope. The existing static web app and GitHub Pages hosting can remain.

## 1. Identity and access

- Provision one permanent tracker user initially, with a stable Supabase Auth user ID. Keep public registration disabled or otherwise restrict enrollment to the intended owner.
- The tracker login is distinct from the Supabase dashboard login used to administer the project. Being signed into the dashboard does not sign the tracker in.
- Associate every climb, monthly goal, queued operation, and migration with the authenticated tracker user. An email address is a login method; the stable user ID is the ownership key.
- Support signing into the same account from a new browser or replacement phone and retrieving all cloud-confirmed records without the old phone or a JSON file.
- Persist and refresh the session so sign-in is infrequent. If the session expires, retain pending changes, stop unauthorized uploads, and ask for sign-in without discarding data.
- Configure reliable email delivery, resend/error behavior, code expiry, and rate limiting before release. Verify the sign-in flow inside the installed iPhone web app as well as Safari.
- Keep email-code sign-in within the $0 constraint. Verify the owner's address is eligible for the built-in sender, its current limits, and actual delivery. Supabase currently restricts that sender to project team addresses with a two-message-per-hour limit and best-effort delivery. If unsuitable, resolve a free delivery option or ask about changing the login method; do not introduce a paid SMTP service or new domain purchase.
- Do not use anonymous-only identity, an embedded user ID, or a shared secret in browser code as the recovery/access model. Anonymous-only access depends on retaining the device session and does not meet the replacement-phone requirement.
- Enable row-level security with ownership checks for reads and writes, including checks against changing an existing record's owner. Unauthenticated users and other authenticated users must not access the owner's records.
- Ship only the publishable API key to the browser. Database passwords and privileged Supabase keys must stay in trusted infrastructure and out of the public repository and logs.
- Sign-out must not silently discard pending operations. Cached data must never be exposed to or uploaded under a different account.

## 2. Permanent storage and data compatibility

- Supabase Postgres becomes the authoritative durable store for climbs and monthly goals. localStorage must stop being the authoritative climbing-data store.
- Preserve all existing IDs, original timestamps, session dates, climb numbers and intentional gaps, walls, grades, colors, outcomes, project flags, ratings, notes, and goal rules. Retain legacy unknown outcomes without inferring completion.
- Existing IDs may not all be UUIDs; the storage design must accept historical IDs or preserve an explicit lossless mapping. Preserve original record values even if the database adds normalized columns.
- Store session days as calendar dates independent of timezone changes. Store recorded instants separately; preserve the existing distinction between timestamp and session day.
- Use server-controlled revisions/update metadata for synchronization. Do not use the phone's clock to decide which edit wins.
- Store and synchronize changes at an appropriate record/session boundary instead of replacing the account's entire dataset on each save.
- Enforce existing validation rules in the database as well as the client. Monthly goals remain unique per owner and month; active climb numbers remain unique per owner and session.
- Inserting, reordering, or moving a climb must update all affected records atomically, preserving the current numbering rules. A failed request must never leave half a reorder applied.
- Keep goal calculations and session summaries behaviorally identical. No additional analytics or route model is needed.

## 3. Offline and mobile behavior

Recommended design: cloud-backed persistence with an IndexedDB cache and durable upload queue. IndexedDB is an implementation proposal, not a second permanent backup. Browser storage may still hold the authentication session and preferences.

- Previously loaded history remains readable offline, and an already-associated account can log, edit, and delete climbs offline.
- Persist the local change and its queued operation together before reporting that the change has been saved on the device. A local-storage failure must be visible and must not be reported as a successful save.
- Each change is sent automatically when online and authenticated. A healthy online connection should initiate upload immediately; propose cloud confirmation within five seconds under normal test conditions, rather than guaranteeing network latency.
- Display understandable states: saved to cloud, waiting to sync with pending count, sign-in required, and sync failed. Show the last successful sync time.
- Report cloud success only after the server confirms a committed write. A cached save or network-connectivity indicator is insufficient evidence.
- Retry transient failures with backoff. Retried operations must not duplicate climbs or apply an insert/reorder twice, including when the server committed but the response was lost.
- Resume pending work after reload, reopening the app, reconnection, and successful reauthentication. Refresh cloud data on opening and returning to the foreground.
- Do not depend on background execution, a tab-close handler, or the installed app remaining alive to finish uploads. Foreground synchronization is the baseline.
- If offline changes exist when the app closes, they must survive reopening on that device. If the device or browser storage is lost before upload, those changes cannot be recovered from Supabase; the interface must make that pending state clear.
- On a fresh offline device, explain that sign-in and an initial download require internet access. Do not show an empty local cache as proof the cloud account is empty.
- Do not cache authenticated API responses indiscriminately in the existing service worker. Keep the offline shell separate from per-user data caching.

## 4. Concurrent edits and deletion

- Two tabs or devices must not silently overwrite each other's work. Use revision checks and a deliberate conflict policy rather than unconditional last-write-wins.
- Recommended baseline: accept independent changes, but stop a stale edit to the same record or session ordering, preserve the attempted edit, and offer refresh/retry. Do not silently renumber competing operations or discard notes.
- Deletes must propagate across devices. Keep deletion markers or equivalent change history so an offline stale client cannot resurrect deleted climbs.
- Account-wide backup import/replacement must be transactional and participate in concurrency control. Operations queued before a replacement/reset must not later repopulate the superseded dataset; use a dataset generation or equivalent safeguard.
- Define destructive actions explicitly: clearing this device's cache must not delete cloud records. A cloud-wide deletion must state its account-wide effect and require confirmation.
- Preserve the current JSON import/export capability. Exports must state whether they include pending local changes; imports must preserve v1/v2 compatibility and existing replacement semantics with appropriate cloud wording.

## 5. Safe migration of existing data

- Run migration on the browser/install that actually contains the user's climbs. The Git repository and Supabase connection do not contain the phone's local records.
- Read existing v2 data through the current validator; retain support for v1 migration. Invalid data must block migration rather than uploading an empty dataset.
- Authenticate first and show the destination account and a preview of climb/goal counts before attaching legacy data to that account.
- Preserve an immutable migration snapshot for recovery. Keep the existing browser keys intact during cutover; a one-time manual export can be an additional precaution, but future resilience must not depend on it.
- If the cloud account already contains data, stop for reconciliation. Do not assume empty local storage should erase cloud records or that a stale second device should overwrite migrated data.
- Make migration resumable and idempotent. Reopening midway must neither duplicate records nor lose progress.
- Verify the full field contents, IDs, counts, session order, and goals by reading them back from Supabase. Counts alone are insufficient.
- Mark migration complete only after verified cloud persistence. Confirm that a fresh browser signed into the same account recovers the migrated dataset.
- Make rollback explicit. Once cloud writes begin, an old local snapshot is stale; returning to the old app requires a current compatible export or a controlled write freeze, not simply redeploying old JavaScript.
- Version the service-worker shell and coordinate stale clients with the new data schema. Do not force an update over an unsaved form or pending migration.

## 6. Free-tier operation and recovery boundary

Initial release scope is automatic cloud persistence, with optional manual JSON exports. The owner explicitly accepts omitting scheduled backups to maintain $0 recurring cost. Synchronization is not a historical backup: accidental deletion, a bad database write, or loss of the Supabase project may not be recoverable without an existing export.

- Use Supabase Free and existing GitHub Pages hosting. Confirm the target organization and project allocation allow a separate project at no charge before provisioning; a separate project in a paid organization must not be assumed free.
- Supabase currently lists a 500 MB database allowance, 5 GB egress, and a limit of two active free projects. Expected climbing data appears comfortably below the database allowance, but database/index overhead, metadata, and other usage must be measured separately from JSON export size.
- Do not introduce scheduled backup infrastructure, paid point-in-time recovery, a required record-version archive, or an off-site storage subscription for this release. Retain only the change/deletion metadata needed for correct synchronization; it does not promise historical recovery.
- Preserve manual JSON export/import as an optional additional safeguard. Verify export/import round-trips in an isolated environment; routine operation must not require remembering to export.
- Recovery acceptance is that cloud-confirmed data can be loaded after losing browser storage or the original phone, while the Supabase project and account remain available. Do not claim guaranteed recovery after database corruption/deletion or a guaranteed recovery time on the free tier.
- Handle free-tier inactivity and outages as unavailable service, not an empty account. Supabase currently lists pausing after one week of inactivity. Explain manual project restoration if needed and retain offline pending changes until uploads can resume. Verify current paused-project retention/restoration rules during setup; pausing is not a permanent archival guarantee.
- Do not introduce artificial keep-alive traffic or paid monitoring as a workaround. Document ownership, administrator account recovery/MFA, quota checks, and resuming a paused project without logging private data or tokens.
- If provider pricing, project allocation, capacity, or email delivery makes the design impossible at $0, stop and present options. No automatic upgrade or paid fallback is authorized.
- A future no-cost backup design can be considered separately; 90 days is the preferred historical retention if adopted, not a blocker for this release.

## 7. Engineering and release constraints

- Introduce a persistence/sync layer so UI code does not directly manage database calls in every event handler. Keep existing model behavior and regression tests.
- Keep schema changes versioned in Git, pin client dependencies, and separate development/test data from production records.
- Preserve the current app URL and installed-app update path where practical. No framework rewrite or native packaging is required for this storage effort.
- Add integration tests for authorization, retries, offline recovery, concurrent ordering, migration, backup replacement, and deletion. Run device tests on iPhone Safari and the installed Home Screen app.
- Never test reset, replacement, migration rollback, or restore against the only production copy.

## 8. Release acceptance scenarios

1. Migrate a representative v1/v2 dataset and verify every field, legacy outcome, ordering gap, and monthly goal survives; retry migration without duplicates.
2. Save online, verify cloud confirmation, then use a fresh browser to sign into the same account and recover the exact records without JSON import.
3. In an isolated test installation, clear browser storage after synchronization and recover everything by signing in again.
4. Log/edit/delete offline, close and reopen the app, reconnect, and verify each operation applies exactly once.
5. Simulate a committed write with a lost response, intermittent connectivity, expired authentication, and rejected requests; verify truthful status and no lost edits.
6. Edit from two devices/tabs, including competing climb numbers, and verify there are no silent overwrites, partial reorderings, or resurrected deletions.
7. Verify unauthenticated requests and a second test account cannot read or mutate the owner's records or impersonate the owner.
8. Verify manual JSON export/import round-trip in an isolated environment, simulate service unavailability without erasing cached data, and confirm the documented configuration uses only free services. Automated historical restore is not a release requirement.
9. Verify local-cache clearing does not delete cloud data, and stale queued changes cannot undo an account-wide replacement/reset.
10. Verify the production update, email-code login, session persistence, foreground resync, and offline reopening on a physical iPhone/Home Screen installation.

## Remaining decisions

- Confirm offline logging with a local cache/queue as the preservation of existing behavior. Cloud-only writes would sacrifice offline logging and require a different requirement.
- Budget is confirmed at $0 recurring. No scheduled backups are required; 90-day historical retention is only a future preference. Verify a free project slot/organization, email-code delivery, and current pause/restoration limitations during setup.
- Confirm the owner email during implementation through an appropriate private setup flow; do not commit it as an authorization shortcut.
- Finalize conflict resolution and minimal synchronization-metadata retention during technical design. A full conflict-management interface or recoverable revision archive is not required if stale operations are safely retained and explained.

## References checked November 12, 2026

- [Supabase Auth](https://supabase.com/docs/guides/auth): application identity and login methods.
- [Email passwordless login](https://supabase.com/docs/guides/auth/auth-email-passwordless): emailed codes, templates, and enrollment behavior.
- [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous): limitations of anonymous account recovery.
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): owner-scoped data access.
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys): browser publishable keys versus privileged server keys.
- [Database backups](https://supabase.com/docs/guides/platform/backups): plan-dependent backups, restoration, off-site exports, and project deletion implications.
- [Pricing](https://supabase.com/pricing): current free-tier capacity, project allocation, and inactivity pausing.
- [Email delivery](https://supabase.com/docs/guides/auth/auth-smtp): default sender eligibility, rate limits, and delivery limitations.

These references describe Supabase capabilities. Cache/queue behavior, conflict handling, migration verification, and recovery from device loss are requirements for this app to implement; connecting Supabase alone does not supply them. Scheduled independent backups and historical recovery are explicitly outside the initial release requirements.
