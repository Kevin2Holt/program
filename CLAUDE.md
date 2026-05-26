# CLAUDE.md — Working in the `program` repo

This file is the short, high-signal guide for AI coding agents (Claude, Codex,
etc.) working in this repo. Read it once at the start of each session. Do not
re-derive these conventions from scratch and do not re-paste the long
specification documents into prompts — read the specs only when a question
truly requires them.

Deeper specs live in the workspace root:

- `program_project_specification.txt`
- `Phase-2-Final-Specification.txt`
- `Phase-3-Final-Specification.txt`

Read those **only when needed** for a specific feature. Treat them as
reference, not as the working brief.

---

## 1. Architecture summary

- **Server**: Node 20+, Express 4, server-rendered EJS. **No SPA**, no
  bundler, no client framework.
- **DB**: PostgreSQL, accessed through `pg` via `src/db/pool.js`. Schema
  changes are SQL migrations in `src/db/migrations/NNN_*.sql` (with `-- UP`
  and `-- DOWN`), run by `npm run migrate` (`src/db/migrate.js`).
- **Sessions**: `express-session` with `connect-pg-simple`; tests inject an
  in-memory store via `createApp({ sessionStore })`.
- **Test runner**: Node built-in (`node --test test/**/*.test.js`).
- **Lint**: ESLint flat config (`eslint.config.js`).
- **CI**: GitHub Actions workflow runs `lint`, `syntax-check`, `test`.

### Folder layout

```
src/
  app.js                         Express factory (createApp)
  server.js                      Boot
  config/env.js                  Env parsing
  db/
    pool.js                      pg pool
    migrate.js                   migration runner
    migrations/*.sql             schema migrations
  middleware/
    attachUser.js                pulls req.user from session
    requireAuth.js               redirects anon users
    loadEvent.js                 loadById / loadByCode -> req.event
    requireCalendarPermission.js calendar.* permission guard
  models/                        thin pg-backed row repositories
  services/                      domain logic; controllers should call these
  controllers/
    public/                      public-facing handlers
    organizer/calendarController.js
  routes/
    index.js                     mounts route families
    publicEventRoutes.js
    publicCalendarRoutes.js
    organizerCalendarRoutes.js
    authRoutes.js
  views/                         EJS templates (see UI section)
public/
  css/base.css                   global tokens + base styles
  css/calendar.css               calendar module styles
test/                            node --test files
```

### Conventions

- Models: thin, return rows; never throw structured errors. Service layer
  owns validation and product rules.
- Services: pure / I/O-light helpers + cross-cutting domain rules. Throw
  errors with `err.status = 400/404/...` for the controller to render.
- Controllers: parse `req.body`, call service, render or redirect. Never
  call models directly when a service exists for that entity.
- Routes: declarative — `requireAuth → loadEvent → requireCalendarPermission
  → controller`. One handler per HTTP verb.
- Use **PRG** (Post-Redirect-Get) on success. On validation failure,
  re-render the form with field errors and the user's submitted values.

---

## 2. Calendar module

### Entities

- `calendar_configs`     — one row per event when the calendar exists.
                           Bounded structured fields in `form_config` /
                           `export_defaults` JSONB.
- `calendar_items`       — bookable units. Archive instead of delete once
                           bookings may reference them.
- `calendar_occurrences` — timed instances of an item (only for `timed`
                           mode). Date-only items have **no** occurrence
                           rows.
- `calendar_bookings`    — booking parent row (one per submission).
- `calendar_booking_selections` — child rows (one per item/date/occurrence
                           selected). Capacity is enforced at this layer.
- `calendar_availability_rules` — one-time or recurring blocking rules.
                           Stored as rules; **never** materialised into
                           blackout occurrence rows.
- `calendar_availability_rule_targets` — join table for `selected` /
                           `single` scope.

### Route families

- `/` and `/:code`                       — public landing / event by code.
- `/c/:code` (public calendar)           — public browse, submit, confirm.
- `/events/:eventId/calendar/...`        — organizer config and management.
- `/auth/...`                            — login / logout placeholders.

### Booking rules (high level)

- A booking = one parent row + 1..N selection rows.
- Capacity is per `(item_id, service_date[, occurrence_id])`. Enforced
  server-side at submission time with a transaction.
- No overbooking. The server is the single source of truth — client JS
  is optional, never authoritative.
- One-time availability rules take precedence over recurring rules.
- Public availability collapses `blocked` / `full` into `unavailable`.
  Organizer-side views can distinguish them.

### Availability resolution order (Phase 3 §availability)

1. Date window boundary
2. Item active/archive status
3. One-time and recurring block rules
4. Remaining capacity

---

## 3. Permissions and auth

- Permission constants live in `src/services/calendarPermissions.js` under
  the `calendar.*` namespace:
  - `calendar.view`
  - `calendar.view.details`
  - `calendar.edit`
  - `calendar.edit.items`
  - `calendar.edit.availability`
  - `calendar.edit.bookings`
  - `calendar.export`
- Standalone-phase policy: any authenticated user on an event gets all
  `calendar.*` permissions. The full role matrix is a later concern; do
  **not** widen the public surface to compensate.
- Every organizer route is guarded:
  `requireAuth → loadById('eventId') → requireCalendarPermission(P) →
  ctrl.handler`.
- Public routes use `loadByCode('code')` and have no auth.

---

## 4. UI / design constraints

- Dark mode is the default (`<html data-theme="dark">`); light mode is an
  optional override. Use the existing CSS custom-property tokens
  (`--color-*`, `--space-*`, `--radius-*`, `--font-*`) from `base.css`.
  Do **not** introduce ad-hoc colors or font sizes.
- Layouts use plain-EJS partial composition, not a layout engine. View
  files open with `include('../layouts/main', { stage: 'open', layoutContext })`
  and close with the same partial at `stage: 'close'`.
- Two layout contexts: `organizer` and `public`. Pick the right one in
  every view.
- Public UI is intentionally simple, readable, mobile-friendly, and
  works without JavaScript. Any client JS must be progressive
  enhancement only — server validation is the source of truth.
- Forms: render errors inline next to the field using the
  `errorsByField` map shape (`{ [fieldName]: [messages] }`) and an
  outer error list. Keep the user's submitted `values` on the page on
  re-render so input is never lost.
- Prefer `data-*` attributes for progressive disclosure (e.g.
  `data-control`, `data-when`, `data-dependent-on`) over inline `style`
  toggles. See `src/views/events/calendar/setup.ejs` for the pattern.

---

## 5. Workflow rules

- **Plan briefly before coding.** A 3–6 line plan is enough; do not
  write essays.
- **Stay in scope.** Modify only what the current milestone touches.
  No drive-by refactors, no "while I'm here" extras, no broad reformat.
- **Reuse existing services and models.** Extend them rather than
  introducing parallel abstractions. If you must add a new service,
  state why.
- **Always run before declaring done:**
  - `npm test`
  - `npm run lint`
  - `npm run syntax-check`
  Treat any failure as blocking.
- **Commits**: logically grouped, short imperative subject. Examples:
  - `feat(calendar): organizer item CRUD (Phase 4B.2)`
  - `fix(views): make layouts/main.ejs compile in EJS`
  - `test: occurrence service overlap detection`
- **Tests** live under `test/` mirroring `src/`. Integration tests stub
  models via `require.cache` hijacking and drive the real Express app
  through Node's `http` — see `test/routes/organizerSetupRoute.test.js`.
- **Validation is server-side.** Any client-side enhancement must be
  optional and additive.
- **Schema changes** are new migration files only; never edit an
  existing migration once it has shipped.
- **Stop at the milestone boundary.** Do not begin the next milestone
  in the same prompt unless explicitly asked.

---

## 6. Quick file map for the calendar module

| Concern        | Files                                                         |
| -------------- | ------------------------------------------------------------- |
| Config         | `services/calendarConfigService.js`, `models/calendarConfig.js`, view `events/calendar/setup.ejs` |
| Items          | `services/calendarItemService.js` *(extend as needed)*, `models/calendarItem.js`, views `events/calendar/items/*` |
| Occurrences    | `services/calendarOccurrenceService.js`, `models/calendarOccurrence.js`, views `events/calendar/occurrences/*` |
| Availability   | `services/calendarAvailabilityService.js`, `models/calendarAvailabilityRule.js`, views `events/calendar/availability/*` |
| Bookings       | `services/calendarBookingService.js`, `models/calendarBooking.js` |
| Export         | `services/calendarExportService.js`                           |
| Permissions    | `services/calendarPermissions.js`, `middleware/requireCalendarPermission.js` |
| Refs/tokens    | `services/calendarReferences.js`                              |
