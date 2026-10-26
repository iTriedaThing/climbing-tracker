# Climb Log v2.0 — sessions, outcomes, and monthly goals

A static, local-first iPhone climbing tracker. Continue using the same GitHub
Pages URL and Home Screen app. No new account, server, or database is required.

## Update your existing app

1. Export a JSON backup from the current app before updating.
2. Unzip this download. Upload the **contents** of `climbing-tracker` into the
   same GitHub repository folder you used before. Include the new `model.js`.
   Keep `index.html` at the existing root, not inside a new nested folder.
3. Wait for GitHub Pages to finish deploying. Open the app online once, then
   close all open Climb Log windows (including Safari tabs and the Home Screen
   app) and reopen it. Repeat once if it still shows the previous version.
4. Look for **v2.0 · Sessions & goals** under the title. Do not clear Safari
   website data or delete the app to force an update.
5. Open **Goals**, select **November 2026**, and save the prefilled target if it
   matches what you want. Goals are suggestions until saved.

Your existing climbs migrate automatically on the same browser origin. If you
move the app to a different address/device, import your JSON backup there.

## What changed

### Outcomes and projects

- **Clean send:** finished without hangs or falls.
- **Finished with hangs/falls:** reached the finish after hanging or falling.
- **Did not finish (DNF):** did not reach the finish.
- **Working on this as a project:** a separate checkbox, usable with any outcome.

Old `sent` records remain clean sends. Old `hung` and `project` records retain
those values and are displayed as **finish unknown**. The old tracker could not
say whether you finished; the upgrade does not guess. Edit these entries to
record a confirmed outcome when you know it. Unknown outcomes do not count as
sends or finishes for goals.

### Daily sessions and climb order

The Session tab replaces This Week. **One calendar day is one session.** Pick
any date, navigate to previous/next logged sessions, or jump to today. Sessions
show logged climbs, clean sends, finishes with hangs/falls, DNFs, and hardest
clean send. History groups by session, newest day first.

Every entry has a **session day** and an editable positive integer **climb #**.
New entries default to the highest number in that session plus one. All logged
outcomes advance this number, including DNFs. It measures the climb/attempt
number, not the clean-send count. Within a session, number order takes priority
over the timestamp.

Inserting at an occupied number shifts later climbs forward. Moving an existing
climb within its session shifts the intervening climbs. Deleting a climb or
moving it to another day leaves a gap in the original session so other numbers
do not silently change. New entries continue after the highest remaining number.
You can also use a larger number to leave a deliberate gap.

Old entries receive numbers in local timestamp order; equal timestamps retain
their original stored array order. Their actual historical order cannot be
recovered automatically if the timestamps were misleading. Edit numbers to fix
that order. Session dates become fixed after migration, so a timezone change
will not regroup already-migrated entries.

Date/time remains available in an expandable control. Changing the timestamp
does not change the session or number. Keep the original session day when
climbing past midnight. Choose another session day when backfilling older climbs.

### Monthly goals

Save a separate per-session rule for each month. The November form starts with:

- 21 clean sends per session;
- no more than 3 pink sends;
- at least 5 sends at **5.10 or harder** OR 3 at **5.11 or harder**.

Grade ranges include minus and plus variations. Repeated sends count every time.
A 5.11 also counts as 5.10-or-harder. All three conditions (total, pink limit,
and either harder-grade requirement) must be met in the same session.

You can change all targets, or count **all finishes**, including those with
hangs/falls, instead of clean sends. Pink and grade counts use that same counting
mode. A harder-grade target of 0 disables that alternative; setting both to 0
removes the harder-grade requirement. Monthly progress shows how many logged
sessions meet the saved rule. Changing a month's rule recalculates its sessions.

## Compatibility and recovery

- No existing IDs, timestamps, notes, ratings, or outcome values are removed.
- On first upgrade, the original `climbLog.entries.v1` storage is copied into a
  versioned `climbLog.state.v2` state that adds session numbers and goals. The
  original key remains untouched as a pre-upgrade recovery copy.
- New app state is written atomically before the UI reports success.
- JSON backup version 2 includes climbs, session order, project flags, and goals.
- Version 1 backups still import; missing session numbers are assigned and
  existing goal settings are retained. Version 2 imports replace climbs/goals.
- Invalid backups are rejected before replacement. Corrupt saved data blocks
  normal writes rather than silently replacing records with an empty list.
- Version 2 backups are for this updated app. The old app does not understand
  the new statuses/goals; retain your pre-update backup for a rollback.
- "Delete all local data" removes climbs, goals, and the old recovery copy.
- Your actual climbing backup is **not included in this code ZIP**.

Future app updates wait until the app is closed or you use Reload to update.
The reload control warns about unsaved edits. Offline use still works after
loading the app successfully online.

## Code organization

- `model.js`: validation, old-data migration, numbering, and goal calculations.
- `app.js`: form controls, daily views, persistence, backup, and app updates.
- `index.html` / `styles.css`: interface and mobile layout.
- `service-worker.js`: versioned offline shell.
- `tests/model.test.cjs`: dependency-free regression tests.

Serve locally with `python -m http.server 8000`. Do not open the HTML directly
from the Files app for normal use. Run logic tests with:

```sh
TZ=America/New_York node tests/model.test.cjs
```

Optionally append the path to a version 1 JSON backup to verify that all its
original record fields survive migration and a version 2 export/import cycle.

## Validation for this release

- Migrated the supplied 200-entry version 1 backup and verified every original
  field was preserved. Verified a version 2 backup round-trip.
- Tested numbering, insertion, reordering, moving between days, legacy outcome
  preservation, both goal counting modes, grade alternatives, and pink limits.
- Chromium browser checks covered create/edit, v1/v2 backup import/export,
  invalid import rejection, reload persistence, time clearing, and layouts at
  320px and 390px widths. No page JavaScript errors were reported.
- Tested upgrading an installed old offline cache to the new release with all
  200 records intact, then reloading offline and saving another climb offline.
- This environment could not run WebKit due to missing system dependencies;
  a physical iPhone/Safari check remains the final device-specific check.
