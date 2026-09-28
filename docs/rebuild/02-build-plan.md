# 2. Build plan

## What exists today

A read-only survey of the old repo found the following:

- **What `main` contains.** `origin/main` is at `3073b28`, 32 commits.
  - It contains **the calendar module and the auth/dashboard/create-event scaffold**, nothing more.
  - There is no programs, blocks, or versions code. The program spec describes a "Step 8" editor that isn't in this repo.
  - So Programs are built from the spec, not ported.
- **Reusable ideas.** These are sound:
  - the migration runner shape
  - the scrypt password format
  - code validation
  - the list of reserved words
  - the selection snapshot fields
  - the ICS escaping
- **Bugs we will not carry over.** Each one gets a regression test in the rebuild:
  1. **Selected-item rules never applied.**
     - `BIGINT` ids came back from `pg` as strings, and were compared with `includes()` against numbers.
     - Rebuild: ids are parsed to one type at the data layer, and there's a regression test.
  2. **`DATE` columns came back as JS `Date` objects.**
     - This broke timed-mode lookups, CSV dates, the CSV date filter, and ICS dates.
     - It also shifted days in UTC+ zones.
     - Rebuild: a type parser returns `DATE` as `YYYY-MM-DD` strings.
  3. **Overbooking was possible.**
     - Nothing locked the rows between counting capacity and inserting a booking.
     - Two identical submits in quick succession caused a 500 error.
  4. **Bookings weren't checked against their event.**
     - A booking could reference another event's items or occurrences.
     - A client-supplied `selected_date` bypassed the window and rule checks for occurrences.
  5. **Every logged-in user had full rights on every event.** The membership check was a TODO.
  6. **The CSV export leaked and misbehaved.**
     - The detail level didn't restrict which fields were exported.
     - There was no protection against CSV formula injection.
     - "Count + names" produced the same output as "names only".
  7. **The rolling window was wrong.**
     - It ignored the time zone.
     - It had no week or month snapping.
     - Month arithmetic overflowed (Jan 31 + 1 month became Mar 3).
     - It was off by one day.
  8. **Several smaller defects:**
     - CSRF protection and rate limits were disabled under tests.
     - There were no rate limits on login or signup.
     - The confirmation email listed "undefined" items.
     - ICS files had no `VTIMEZONE` and no line folding.
     - Emails were unique only case-sensitively.

## Milestones (version = 0.N)

Each milestone ends when all of these are done:

- `npm run verify` passes (check, lint, test).
- Playwright flows pass.
- Screenshots have been reviewed in both themes at 390 px and 1280 px.
- CLAUDE.md is updated.
- The work is committed and pushed.

| # | Milestone | Delivers |
|---|---|---|
| **0.1** | **Foundation and design system** | Covered below the table. |
| **0.2** | **Events and routing** | Events, codes, and redirects. Covered below the table. |
| **0.3** | **Programs** | The block editor and publishing. Covered below the table. |
| **0.4** | **Calendar engine and organizer setup** | The pure rule modules and organizer screens. Covered below the table. |
| **0.5** | **Public signup** | The public calendar, booking, and confirmation. Covered below the table. |
| **0.6** | **Organizer bookings and export** | Booking management and CSV export. Covered below the table. |
| **0.7** | **Seeds, polish, handoff** | Covered below the table. |

**0.1: Foundation and design system**

- SvelteKit scaffold, env config, a Windows-safe npm script set, lint rules for Kevin's style, and CLAUDE.md.
- Migration runner, plus the `users`, `sessions`, and `rate_limit_buckets` tables.
- Tokens and the full component library: Button, Field, Input, Textarea, Select, Combobox, DatePicker, TimePicker, NumberStepper, Checkbox, Radio, Switch, Segmented, WeekdayPicker, Dialog, ConfirmDialog, Drawer, Sheet, Menu, Popover, Toast, Tooltip, Skeleton, EmptyState, Alert, Badge, Status, SaveState, Tabs, Table, and ItemMarker.
- Theme cookie with no flash.
- A dev-only `/_design` page.
- Auth: sign up, log in, log out, and account settings (name, email, password).
- CSRF hook, rate limits, and security headers.
- Test database helpers.

**0.2: Events and routing**

- `events`, `event_members`, `event_old_codes`, and `reserved_words` (seeded).
- A permission module with `calendar.*` and `program.*` permissions.
- Dashboard with create-event (live code check).
- Event settings: rename, change code, archive.
- Public `/[code]` resolution:
  - an old code redirects with a 308
  - an unknown code gets a styled 404
- Route-collision tests.

**0.3: Programs**

- `program_versions` and `program_blocks`.
- A block service in which every mutation updates the rows and `block_order` together in one transaction.
- Sanitizer.
- JSON block API.
- Editor:
  - Tiptap text blocks, label/value blocks, and separator blocks
  - insert between blocks, duplicate, and delete with undo
  - drag and keyboard reorder
  - debounced autosave with saving/saved/error states
  - a live preview that uses the same renderer as the public page
- Publish, unpublish, and roll back.
- The public program page, linking to the calendar when one is open.

**0.4: Calendar engine and organizer setup**

- Calendar schema.
- The pure modules, each exhaustively tested:
  - `dateWindow`
  - `recurrence`
  - `availability`
  - `overlap`
  - `capacity`
- Organizer pages: Setup, Items (with times), Availability rules, and the Overview with organizer statuses.

**0.5: Public signup**

- An availability endpoint for the visible window.
- The week grid, day panel/sheet, "Your selections", and filters.
- Signup form.
- The booking transaction, with row locks, an idempotency key, snapshots, and partial-conflict results.
- The confirmation page and ICS file (both modes).
- The mail transport, logged in development.

**0.6: Organizer bookings and export**

- Bookings table: required columns, filters, and pagination.
- Booking details, with an edit/reschedule drawer that has conflict explanations, and cancel.
- A booking activity log.
- CSV export with detail levels and field inclusion, enforced in the service, plus formula-injection escaping.

**0.7: Seeds, polish, handoff**

- Seeds: "missionary meals" (date-only, 4 companionships, rolling window, Allow and Block rules) and "breakout sessions" (timed, repeated occurrences, overlaps).
- Accessibility pass: keyboard walkthroughs and axe checks in Playwright.
- A phone performance check on the public pages.
- A final screenshot pass.
- `HANDOFF.md`.

The order follows the Phase 3 sequencing rule: booking UI comes only after the engine is tested.

## Data model

Every table has `created_at` and `updated_at` columns (`timestamptz`), which aren't repeated below.

Ids are `bigint generated always as identity`. The data layer converts ids to JS numbers in one place.

Calendar tables carry `event_id` and use **composite foreign keys**, e.g. `(event_id, item_id)`. The database itself therefore makes it impossible for a rule, time, or booking to reference another event's items.

### Accounts and events

| Table | Key columns |
|---|---|
| `users` | `id`, `email citext unique`, `display_name`, `password_hash` |
| `sessions` | `token_hash bytea pk`, `user_id`, `csrf_token`, `expires_at`, `last_seen_at` |
| `rate_limit_buckets` | `key text`, `window_start timestamptz`, `hits int`, pk(`key`, `window_start`) |
| `reserved_words` | `word pk`, `reason` (seeded) |
| `events` | `id`, `name`, `code` (unique, lowercase, shape-checked with a CHECK), `created_by`, `archived_at` |
| `event_old_codes` | `code pk`, `event_id`, `retired_at` |
| `event_members` | pk(`event_id`, `user_id`), `role` in (`owner`, `editor`, `viewer`) |

- **Codes are one namespace.** A trigger keeps `events.code` and `event_old_codes.code` mutually unique, and the service also checks `reserved_words`.
- **Roles.** Only `owner` is used now. `event_invites` is deferred, with no table yet.

### Programs

| Table | Key columns |
|---|---|
| `program_versions` | `id`, `event_id`, `kind` in (`draft`, `published`, `previous`), `header jsonb` (eyebrow, title, date, time, place), `block_order jsonb` (array of block ids), `published_at` |
| `program_blocks` | `id`, `version_id`, `type` (`text`, `label_value`, `separator`), `content jsonb`, `html text` (sanitized; text blocks only) |

- `program_versions` has `unique(event_id, kind)`.
- **Block content by type.** This is a registry, so new block types slot in:
  - `text`: `{ doc }` (ProseMirror JSON)
  - `label_value`: `{ rows: [{ id, label, value }] }`
  - `separator`: `{ variant: "line" | "space" }`
  - `columns`: designed but deferred. It will be `{ columns: [{ block_order }] }`, with child blocks referencing the same version.
- **Publishing:**
  - **Publish:** deep-copy the draft's blocks.
    1. Delete the old `previous`.
    2. Rename `published` to `previous`.
    3. Insert the copy as the new `published`.
  - **Roll back:** swap `published` and `previous`.
  - **Unpublish:** the `published` version becomes `previous` (replacing any older `previous`), so Roll back can restore it. *(As built in 0.3; the original plan kept the older `previous` and deleted `published`.)*

### Calendar

| Table | Key columns |
|---|---|
| `calendar_configs` | `event_id pk`, `title`, `status` in (`draft`, `open`, `closed`), `time_zone` (IANA), `window_mode` in (`fixed`, `rolling`), `fixed_start`, `fixed_end`, `rolling_size`, `rolling_unit` in (`days`, `weeks`, `months`), `min_days_ahead int default 0`, `timed bool`, `prevent_overlap bool`, `form_fields jsonb`, `email_confirmation bool`, `ics_enabled bool`, `ics_mode` in (`combined`, `separate`) |
| `calendar_items` | `id`, `event_id`, `name`, `capacity`, `color` (palette key), `shape` in (`circle`, `square`, `triangle`, `diamond`, `hexagon`, `star`, `glyph`), `glyph char(1)`, `sort_order`, `archived_at` |
| `calendar_item_times` | `id`, `event_id`, `item_id`, `start_time time`, `duration_minutes`, `label`, `capacity_override`, `only_date date null`, `archived_at` |
| `calendar_rules` | `id`, `event_id`, `effect` in (`allow`, `block`), `kind` in (`once`, `recurring`), `once_date`, `frequency` in (`daily`, `weekly`, `biweekly`, `monthly_date`, `monthly_weekday`), `weekdays smallint[]`, `month_day`, `month_week` (1–4, or −1 for "last"), `month_weekday`, `starts_on`, `ends_on`, `applies_to` in (`all`, `selected`), `label`, `active` |
| `calendar_rule_items` | pk(`rule_id`, `item_id`), plus `event_id` for the composite FKs |
| `calendar_bookings` | `id`, `event_id`, `confirmation_ref text unique` (32 random bytes, base64url), `idempotency_key uuid`, `status` in (`active`, `canceled`), `name`, `phone`, `contact_method`, `number_type`, `email`, `notes`, `email_sent_at`, `canceled_at` |
| `calendar_selections` | `id`, `booking_id`, `event_id`, `item_id`, `time_id null`, `service_date date`, snapshots (`item_name`, `time_label`, `start_time`, `duration_minutes`) |
| `calendar_booking_log` | `id`, `booking_id`, `actor_user_id null`, `action`, `detail jsonb`, `at` |

- **`form_fields`** is shaped like `{ phone: { on, required }, contactMethod: …, numberType: …, email: …, notes: … }`.
- **Times and occurrences.** A row in `calendar_item_times` defines when an Item is offered:
  - With `only_date` null, the time repeats on every date the Item is available.
  - With `only_date` set, it's a one-off on that date.
  - An **occurrence** is (time, date). Its capacity is `capacity_override ?? item.capacity`.
- **Rules.** For biweekly rules, `starts_on` is the anchor week.
- **Bookings:**
  - `unique(event_id, idempotency_key)`.
  - Canceled bookings free their capacity.
- **Selections:**
  - Capacity is always counted with `count(*)` over the selections of active bookings.
  - `unique(booking_id, item_id, service_date) where time_id is null` enforces "same Item twice on one date" in the database too.
- **The booking log** records edits, reschedules, and cancels shown on the details page.

### Booking transaction (the risky path)

1. Normalize and dedupe the submitted selections. Reject a submission that includes the same Item twice on one date (date-only mode).
2. Open a transaction and take `pg_advisory_xact_lock` on every affected (item, date) or (time, date) key.
   - Keys are sorted first so two submissions can't deadlock.
   - This serializes only the bookings that compete for the same capacity.
3. If the idempotency key already exists, return that booking. A double submit lands on the same confirmation page.
4. Re-resolve every selection with the same `availability` module the grid uses:
   - window
   - archived state
   - rules
   - capacity computed inside the lock
   - overlap within the submission
5. **If everything passes:** insert the booking and its selections, with snapshots, and commit.
6. **If anything fails:** roll back and return a per-selection result (`ok` / `taken` / `closed` / `overlap`).
   - The client removes only the failed selections, keeps the rest, and explains what happened.
7. Email is sent **after** the commit. A mail failure never fails a booking.

Organizer edits and reschedules use the same path with the booking's own selections excluded from the counts. A move into a full or overlapping target is refused with the reason, for example "Park & Moreau is full on Sat, Oct 24 (1 of 1)".

## Route map

SvelteKit sorts static segments ahead of parameters, so `/events/…` can never be read as an event code. As a guard, a test lists every top-level route directory and asserts that each one is in `reserved_words`.

### Public

| Route | Purpose |
|---|---|
| `GET /` | Minimal landing page with a log in link |
| `GET /login`, `GET /signup` | Auth pages. The form actions are rate-limited. |
| `POST /logout` | Log out |
| `GET /[code]` | Published program (an old code redirects with 308; an unknown code gets a styled 404) |
| `GET /[code]/calendar` | Public calendar: grid, day panel, selections, signup form |
| `GET /[code]/calendar/confirmation/[ref]` | Confirmation page |
| `GET /[code]/calendar/confirmation/[ref]/calendar.ics` | Add-to-calendar file, when enabled |

### Organizer (authenticated; every route checks an explicit permission)

| Route | Permission |
|---|---|
| `/dashboard` | any member |
| `/account` | self |
| `/events/[id]/settings` | `event.manage` (owner) |
| `/events/[id]/program` | `program.edit` |
| `/events/[id]/calendar` (overview) | `calendar.view` |
| `/events/[id]/calendar/setup` | `calendar.edit` |
| `/events/[id]/calendar/items` | `calendar.edit.items` |
| `/events/[id]/calendar/availability` | `calendar.edit.availability` |
| `/events/[id]/calendar/bookings` | `calendar.view.details` |
| `/events/[id]/calendar/bookings/[bookingId]` | `calendar.view.details`; editing needs `calendar.edit.bookings` |
| `/events/[id]/calendar/export` | `calendar.export` |

### JSON API (session, CSRF header, and rate-limited where public)

| Route | Method | Permission |
|---|---|---|
| `/api/public/[code]/calendar/availability?from&to` | GET | public |
| `/api/public/[code]/calendar/bookings` | POST | public (rate-limited) |
| `/api/events/[id]/program/blocks` | POST | `program.edit` |
| `/api/events/[id]/program/blocks/[blockId]` | PATCH, DELETE | `program.edit` |
| `/api/events/[id]/program/blocks/[blockId]/duplicate` | POST | `program.edit` |
| `/api/events/[id]/program/order` | PUT | `program.edit` |
| `/api/events/[id]/program/publish`, `/unpublish`, `/rollback` | POST | `program.publish` |
| `/api/events/[id]/calendar/items[/itemId]` | POST, PATCH | `calendar.edit.items` |
| `/api/events/[id]/calendar/rules[/ruleId]` | POST, PATCH, DELETE | `calendar.edit.availability` |
| `/api/events/[id]/calendar/bookings/[bookingId]` | PATCH | `calendar.edit.bookings` |
| `/api/events/[id]/calendar/export` | POST (streams CSV) | `calendar.export` |

Organizer forms that aren't autosaving use SvelteKit form actions with `use:enhance`, so no full-page reloads.

**Permissions:**

- Namespaces:
  - `calendar.*`: as locked in the transfer document
  - `program.*`: `program.view`, `program.edit`, `program.publish`
  - `event.*`: `event.manage`
- `permissionsFor(role)` maps each role to its permission set. Today `owner` gets all of them.
- Every handler calls `requirePermission(event, user, "…")`.
- Services re-check sensitive actions.

## Deliberate changes from the reference documents

| # | Change | Why |
|---|---|---|
| 1 | SvelteKit instead of Express + EJS | Section 4 of the brief allows it. See `01-stack.md`. |
| 2 | Public pages require JavaScript | Required by the brief. Pending selections live on the client, not in a server session. |
| 3 | Availability rules can Allow as well as Block. Target scope is only `all` / `selected`. | Required by the brief. `single` is just `selected` with one Item. |
| 4 | **Occurrences are defined by item time rows** (repeating daily, or on one date) rather than pre-generated per-date rows | Pre-generating rows can't cover a rolling window. An occurrence is (time, date). Bookings snapshot the time, so editing or archiving a time never changes history. "Fixed time" and "selectable timeslots" are the same data: an Item with one time or with several. |
| 5 | Calendar `status` (draft / open / closed) replaces `enabled` + `public_visibility_state` | One clear control. The old visibility flag was never enforced. |
| 6 | Monthly-by-weekday adds "Last" | "Last Sunday" is a common need. The old code had only a literal "5th". |
| 7 | Item colors are palette keys, not hex values | Each key has a dark and a light value tuned for AA contrast. Free hex can't guarantee that in both themes. |
| 8 | Program versions carry a small `header` (eyebrow, title, date, time, place) | Makes the public page look finished without a block. **See Questions.** |
| 9 | A booking activity log is added | Supports the "Last edited … moved Oct 20 → Oct 22" line on the details page, and makes organizer edits accountable. |
| 10 | Bookings table rows are **one booking on one date**, with that date's Items grouped | The brief's first column is the booked date; a multi-day booking would otherwise have no single date. |
| 11 | Cancel is a soft status and frees capacity | Keeps records reviewable and exportable, per the history rules. |
