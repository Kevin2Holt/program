# CLAUDE.md: working in the progr.am repo

progr.am is a web app for event **programs** (block-based, published to `progr.am/<code>`) and **signup calendars** (people sign up for Items on dates or timed occurrences). This is the rebuild (branch `rebuild`). The plan, design system, and decisions live in `docs/rebuild/`: read `README.md` there first. The old implementation stays on `main` for reference only.

## Commands (all work on Windows)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 (uses `DATABASE_URL`) |
| `npm run db:migrate` / `db:rollback` / `db:status` | Apply, undo the last, or list migrations |
| `npm run db:seed` | Load demo data (from milestone 0.7) |
| `npm run check` | svelte-check (types, a11y, template errors) |
| `npm run lint` / `lint:fix` | ESLint, including the style rules below |
| `npm test` | Vitest: unit and service tests against the real `progr_am_test` database |
| `npm run test:e2e` | Playwright against a production build on :4173 (test database) |
| `npm run test:screens` then `node scripts/screen-sheets.js` | Screenshots of every screen in both themes at 390 px and 1280 px, plus review sheets |
| `npm run verify` | check + lint + test. **Must pass before any commit that ends a milestone.** `verify:full` adds e2e. |

Tests reset `progr_am_test` from migrations each run. Never point tests at the dev database; the setup refuses to.

## Architecture

- **SvelteKit 2 + Svelte 5 (runes)**, `adapter-node`, **JavaScript with JSDoc**. `src/app.d.ts` is the only TypeScript file, because the framework needs it.
- **PostgreSQL via postgres.js** (`src/lib/server/db.js`). Only tagged-template queries, so values are always parameters.
  - `DATE` → `"YYYY-MM-DD"` string, `TIME` → `"HH:MM:SS"` string, ids are `integer` (JS numbers).
  - Never convert calendar dates through JS `Date` in local time.
- **Migrations:** `db/migrations/NNN_name.up.sql` plus a **required** `.down.sql`, run by `scripts/migrate.js`. A migration can be edited until it's committed on a pushed milestone; after that, add a new one.

### Layers (keep them separate)

| Layer | Where | Rules |
|---|---|---|
| Routes and handlers | `src/routes/**/+page.server.js`, `+server.js` | Parse input, check permission, call a service, return data, or `fail()`/redirect. No business rules. |
| Services | `src/lib/server/services/` | All business rules and validation. Return `succeed(value)` / `fail(code, message, errors)` from `$lib/result.js` for expected outcomes; throw only for real faults. |
| Data access | `src/lib/server/data/` | Thin SQL functions. No rules. |
| Pure shared logic | `src/lib/*.js`, `src/lib/calendar/` | No I/O. Runs in the browser and on the server (dates, times, validation, calendar engine). |
| Views | `src/lib/components/`, `+page.svelte` | Render only. |

Aliases: `$lib` → `src/lib`, `$server` → `src/lib/server` (server-only; SvelteKit refuses to bundle it for the browser).

### Request pipeline (`src/hooks.server.js`)

1. Theme cookie → `<html data-theme>`, so the page never flashes the wrong theme.
2. A per-visitor **CSRF token** in an HttpOnly cookie. Forms send it as a hidden `csrf` field (`<Form>` adds it); fetches send the `x-csrf-token` header (`page.data.csrfToken`).
3. The session cookie is resolved to `locals.user`. Only a SHA-256 hash of the token is stored.
4. Every non-GET request must be **same-origin and carry the token**, or it's refused with a 403.
5. Security headers are added to every response. Errors log a reference id; users see only the id.

Other protections:
- **Rate limits** (`$server/http/rateLimit.js`, stored in Postgres) cover login, signup, account changes, and all public writes, through `limitFormAction` / `limitEndpoint`.
- Organizer routes live in the `(org)` route group, whose layout calls `requireUser`.
- Permission checks come in milestone 0.2 (`permissionService`). **Every** organizer handler checks an explicit permission.

## Design system (non-negotiable)

- **Tokens:** `src/lib/styles/tokens.css`. **Components:** `src/lib/styles/components.css` plus `src/lib/components/ui/*.svelte`.
- Use tokens only: no raw colors, sizes, radii, shadows, or durations in components.
- **No browser-default controls.** Use:
  - `Select` (with `searchable` for a combobox)
  - `DatePicker`, `TimeInput`, `NumberStepper`
  - `Switch`, `Checkbox`, `Segmented`, `ChoiceCards`, `WeekdayPicker`
  - `Dialog` (modal or `variant="drawer"`)
  - `confirmAction()` instead of `confirm()`
  - `showToast()` for feedback
  - `Menu`, `Alert`, `EmptyState`, `Skeleton`, `SaveState`, `Status`, `Badge`, `ItemMarker`
- Wrap every input in `Field`, which provides the label, hint, inline error, and aria wiring. Wrap forms in `Form`, which adds the CSRF field, avoids a reload, and tracks pending state.
- **Themes:** dark is the default and light is first-class. Check both (use `npm run test:screens`).
- **Density:** public pages are phone-first (16 px text, 44 px targets, `body.is-public`); organizer pages are compact (14 px, 32 px controls).
- **States:** every screen needs empty, loading, error, and permission-denied states, plus validation next to the field.
- **Motion:** transitions are short (120–260 ms) and come from tokens; reduced motion is honored.
- The mockups in `docs/rebuild/mockups/` are the approved look. The dev-only `/design-system` page shows every component live.

## Code style (Kevin's rules; ESLint enforces most)

- **Tabs**, never spaces.
- **Braces:**
  - Opening brace at the end of the line.
  - A multi-line block's closing brace on its own line at the opener's indentation. `});` is fine.
  - `else` and `catch` start on the line after the `}` (Stroustrup style).
- **Blank lines group code:**
  - 1 between related parts.
  - 2–4 between less related sections.
  - **Exactly one blank line after a function declaration line.** A local ESLint rule enforces this; arrow callbacks are exempt.
- **File order:** constants/settings, then reusable library-style functions, then program-specific functions, then the code that runs everything.
- **No magic numbers:** use named constants (e.g. `HTTP.notFound`, `SESSION_LIFETIME_MS`). Sentinel values get a reference-key comment.
- **Errors:** handle them gracefully. Services return results; throw only when that's clearly better.
- **Comments** do one of three things: say what the code should do, explain why a choice was made, or give a reference key.
- **Names:**
  - Functions contain a verb.
  - Variables say what they hold and in what form (`duration_min`, `date_iso`, `retryAfterS`).
  - camelCase, with underscores separating hierarchical parts, highest level first (`calendar_itemIds`).
- **Framework conventions win where required,** e.g. `+page.svelte` file names and `let { … } = $props()` (so `prefer-const` is off in `.svelte` files). Prettier is intentionally not used, because it would delete the blank line after function declarations.
- **Double quotes, semicolons, no trailing commas.**

## Workflow

- Work milestone by milestone (plan: `docs/rebuild/02-build-plan.md`).
- Each milestone:
  1. Implement it and write its tests.
  2. Run `npm run verify` and `npm run test:e2e`.
  3. Run the screens pass and review the sheets.
  4. Update this file.
  5. Commit and push `rebuild`.
- **Commits:** small and logical. A short readable summary line, then detail lines only when needed.
- **Versioning:** milestone N is version `0.N.0`, and fixes between milestones are `0.N.x`. Stay on 0.x until Kevin declares a release.
- Never commit `.env` or secrets; keep `.env.example` current.
- Don't touch other databases or services on the machine.

## Status

- **0.1 foundation (done):**
  - SvelteKit scaffold, migrations, auth (sign up, log in, log out, account), sessions, CSRF, rate limits, and security headers
  - The design-system components, the theme cookie, and the organizer shell
  - Tests: Vitest service tests, Playwright e2e, and the screens pass
- Next: 0.2 events and routing.
