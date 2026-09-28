# progr.am rebuild: handoff

Branch **`rebuild`**, version **0.7.0**. `main` is unchanged (old code, reference only). PR: Kevin2Holt/program#1.

This file covers how to run the app on Windows, what each milestone built, how to test it by hand, and what is still missing. For day-to-day rules (architecture, design system, code style), see [`CLAUDE.md`](../../CLAUDE.md). For the plan and the decisions behind it, see [`README.md`](README.md) in this folder.

---

## 1. Windows setup

Prerequisites: Git, Node 24, PostgreSQL 17 (on `localhost:5432`), and optionally `gh`. Run all commands in PowerShell from the repo folder.

### Databases (once)

The app uses its own role and two databases. Nothing else on the machine is touched.

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE ROLE progr_am LOGIN PASSWORD 'choose-a-password';"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE progr_am_dev OWNER progr_am;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE progr_am_test OWNER progr_am;"
```

### Configuration

```powershell
Copy-Item .env.example .env
notepad .env   # set the password in DATABASE_URL and TEST_DATABASE_URL
```

`.env` is git-ignored; never commit it. `PUBLIC_BASE_URL` is the base for confirmation links, emails, and `.ics` files. `MAIL_TRANSPORT=log` prints emails to the console; `smtp` sends them through `SMTP_URL`.

### Install, migrate, seed, run

```powershell
npm install
npx playwright install chromium   # for the browser tests
npm run db:migrate                # dev database
npm run db:seed                   # demo data (re-runnable)
npm run dev                       # http://localhost:5173
```

The seed creates a demo organizer. The login is in `scripts/seed.js` (`DEMO_EMAIL` / `DEMO_PASSWORD`), and the seed prints it when it finishes. Demo events:

| Public page | What it shows |
|---|---|
| `/elm-ward-meals/calendar` | Date-only calendar with 4 companionship Items and a rolling 3-week window. Rules: Block Mondays (P-day), Allow Tue/Thu/Sat for Sisters Park & Moreau only, Block first Sunday, one-time Allow on a Monday, and an inactive biweekly rule. Has bookings. |
| `/leadership-summit/calendar` | Timed calendar over a fixed 3-day window, with repeated and overlapping sessions (overlap prevention on), one time limited to a single date, an all-day Item, and separate `.ics` events. |
| `/elm-ward` | Published sacrament meeting program. |

Organizer pages: log in, then open an event from the dashboard.

### Production-style run

```powershell
npm run build
node build          # uses PORT and ORIGIN from .env
```

### Checks

| Command | What it runs |
|---|---|
| `npm run verify` | svelte-check, ESLint (with Kevin's style rules), and Vitest (unit and service tests against `progr_am_test`) |
| `npm run test:e2e` | Playwright flows and axe accessibility checks, against a production build on :4173 using the test database |
| `npm run test:screens` then `node scripts/screen-sheets.js` | Every screen in both themes at 390 px and 1280 px, plus review sheets in `test-results/screens/sheets/` |

The tests reset `progr_am_test` on every run and refuse to run against the dev database.

Last full run (0.7.0, 2026-09-28): `verify` passed (0 svelte-check problems, 0 lint problems, 129 of 129 Vitest tests); `test:e2e` 36 of 36 passed (including axe in both themes); screens 5 of 5 passed and the sheets were reviewed.

---

## 2. What was built

| Version | Milestone | Highlights |
|---|---|---|
| — | Checkpoint | Plan, design system, 15 approved mockups, and the Allow/Block availability spec with worked examples (`docs/rebuild/`) |
| 0.1 | Foundation | SvelteKit 2 + Svelte 5 + postgres.js; SQL migrations with down files. Accounts (scrypt), hashed session tokens, CSRF (double-submit plus origin check), and rate limits stored in Postgres. Security headers, and error pages that show only a reference id. Full design-system component set (no browser-default controls, no `confirm()`), dark/light theme cookie with no flash, and the organizer shell. |
| 0.2 | Events and routing | Custom codes with reserved words, and one namespace shared by current and retired codes (DB triggers). Old codes 308-redirect, subpaths included. Event members, roles, and permissions (`calendar.*`, `program.*`); non-members get 404 and members lacking the permission get 403. Dashboard, create dialog with live code check, settings, and archive. |
| 0.3 | Programs | Draft / published / previous versions; text (Tiptap, sanitized on the server), label/value, and separator blocks. Header, autosave per block, drag or keyboard reorder, duplicate, and delete with Undo. Live phone/desktop preview; publish, unpublish, and roll back. |
| 0.4 | Calendar engine and setup | Pure, exhaustively tested engine: window, recurrence, availability order, capacity, overlap, and rule descriptions. Setup page (autosave, progressive disclosure, time zone, minimum days ahead), Items (color, shape, times), Availability rules, and an overview week grid that shows the reason for each status. |
| 0.5 | Public signup | Paper-calendar grid, day panel (bottom sheet on phones), picks summary, and a details form built from the setup fields. The booking transaction uses per-offering advisory locks, an idempotency key, and a server re-check of every rule, returning a reason per selection. 256-bit confirmation reference, with the link built from `PUBLIC_BASE_URL`. `.ics` (one per day, one per selection, or all in one; UTC). Optional confirmation email. |
| 0.6 | Organizer bookings and export | Bookings table (Date, Item(s), Name, Phone, Contact, WhatsApp, Notes; latest first; filters; cards on phones). Details page with activity log; edit or reschedule with the same availability checks; cancel with Undo (restore). CSV export with fixed columns per detail level, a live preview, and formula-injection protection. |
| 0.7 | Seeds, accessibility, polish | Seed script through the real services. axe WCAG 2.1 AA checks on every main page in both themes (zero violations). Fixes: link underlines, focusable scroll regions, contrast of the light success color and export cards, a labeled number stepper, and public copy for an empty published program. The public booking API now returns only the reference. Phone performance check (below). |

Bugs from the old code that are fixed by design, with tests:
- Selected-Item rules never applied (BIGINT ids came back as strings).
- Dates shifted (`DATE` became a JS `Date`).
- Nothing prevented overbooking.
- Every logged-in user could edit every event.
- Export leaked fields.

### Phone performance (0.7 check)

Production build, iPhone 13 viewport, 4× CPU throttle, slow 4G (1.6 Mbps, 150 ms):

| Page | First paint | Load | Transferred |
|---|---|---|---|
| `/elm-ward` (program) | 1.25 s | 1.7 s | 261 KB |
| `/elm-ward-meals/calendar` | 0.99 s | 1.7 s | 309 KB |
| `/leadership-summit/calendar` | 0.98 s | 1.5 s | 292 KB |

The Tiptap editor chunk (about 384 KB) loads only on the organizer program editor. Public pages never load it.

---

## 3. Manual test steps

Run `npm run db:seed`, then `npm run dev`, and log in as the demo organizer. Try each flow in both themes (toggle in the top bar) and at phone width (browser dev tools, 390 px).

1. **Public signup, date-only:** open `/elm-ward-meals/calendar`.
   - Mondays are blocked, except the one-time Allow.
   - Sisters Park & Moreau appear only on Tue/Thu/Sat.
   - The first Sunday of each month is blocked.
   - Pick two Items on different days. Continue, fill the form (try an invalid phone first), and submit.
   - The confirmation shows your picks, an **Add to my calendar** `.ics`, and a copyable link.
   - Booked spots (capacity 1) disappear from the calendar.
2. **Public signup, timed:** open `/leadership-summit/calendar`.
   - Pick *Leading Volunteers 9:00*. *Design Thinking Lab 9:30* is now shown as overlapping and can't be added.
   - Keynote appears only on the first day. Submit, then download the `.ics`: it contains one event per session.
3. **Rule management:** Ward Missionary Meals → Calendar → Availability.
   - Turn the inactive "District council" rule on, and check Overview or the public calendar for Elders Tuilagi & Brooks on alternate Wednesdays.
   - Add a one-time Block on a date that has bookings. Existing bookings stay; new signups are refused.
   - Delete a rule; a confirmation dialog appears first.
4. **Booking edit:** Calendar → Bookings → a person → **Edit**.
   - Move one signup onto a date that's already full: it's refused with the reason.
   - Move it to a free date: it saves, and the activity log records the edit.
   - **Cancel booking** → confirm → **Undo** from the toast.
5. **Export:** Calendar → Export.
   - Switch detail levels; the preview columns change to match.
   - *Names only* never shows phone or email.
   - Download CSV and open it in Excel.
6. **Program:** Elm Ward Sacrament Meeting → Program.
   - Edit a label/value row and reorder blocks (drag, or keyboard: focus the grip, then Space and the arrows). Watch the preview.
   - **Publish**, then open `/elm-ward` in a private window.
   - **Unpublish** shows the "not published" page, and **Roll back** restores it.
7. **Codes:** Event settings → change the code. The old `/code` and `/code/calendar` URLs redirect to the new one.
8. **Permissions:** create a second account. Opening the first account's `/events/<id>/…` URLs returns 404.

---

## 4. Known limitations

- **Single owner per event.** The roles and permissions model exists in the database (`event_members`, `PERMISSION.*`), but there's no UI to invite collaborators or change roles yet.
- **No password reset or email verification.** Email is used as the login but isn't verified.
- **Program blocks:** only text, label/value, and separators. Columns, images and attachments, and embeds were deferred.
- **No password-gated programs or calendars.**
- **Email:** confirmation email uses the `log` transport by default. SMTP works but hasn't been tested against a real provider. There are no reminder emails.
- **Time zones:** each calendar has one Event Time Zone. Times are shown in that zone, not the viewer's (by design).
- **Rate limits** are stored per IP in Postgres. Behind a proxy, set `ADDRESS_HEADER` / `XFF_DEPTH` (adapter-node) so the real client IP is used.
- **`npm audit`:** production dependencies have 0 vulnerabilities. There are 3 low-severity advisories in `cookie` (through SvelteKit's tooling), waiting on an upstream release.

## 5. Deferred items (from the plan)

- Collaborators: invites, role management UI, and ownership transfer
- Password reset, email verification, and optional two-factor authentication
- Program blocks: columns, images and attachments, embeds, and a hymn/song lookup
- Password gates for public pages
- Waitlists when an offering is full
- Reminder emails and SMS
- Organizer-created bookings (adding a person on their behalf from the Bookings page)
- Deployment configuration (hosting, backups, TLS); the app is ready for `node build` behind a reverse proxy

## 6. Suggested next steps

1. Review the PR and merge `rebuild` into `main` when ready (merging replaces the old implementation).
2. Choose hosting (any Node 24 + Postgres 17 host), set `ORIGIN`, `PUBLIC_BASE_URL`, and SMTP, then run `npm run db:migrate` there.
3. Build the collaborators UI on top of the existing permission model; it's the most-requested missing piece for wards with several organizers.
4. Add password reset, which needs working SMTP.
5. Add the next program blocks (columns, images) through `src/lib/blocks/registry.js`.
