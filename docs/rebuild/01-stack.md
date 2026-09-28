# 1. Stack proposal

## Fixed requirements (from the brief)

- Node.js backend and PostgreSQL.
- Every business rule is enforced on the server: availability, capacity, overlap, and permissions.
- Polished interactive UI: the calendar selection panel, a drag-and-drop block editor, autosave, and custom controls everywhere.
- Fast public pages on phones.
- Maintainable by one person who knows JavaScript, Python, HTML/CSS, and SQL.
- Every npm script runs on Windows.

## Options

### A. Express 5, server templates, and a light client layer (Alpine.js or htmx, plus Vite for a few islands)

This is closest to the old app.

- **Pros**
  - Familiar, with minimal magic.
  - Pages are server-rendered and fast.
  - Small dependency surface.
- **Cons**
  - The rebuild's hard parts are all rich client state: the calendar panel with its single-state selection model, the block editor, autosave, and a dozen custom accessible controls (select, combobox, date/time pickers, dialogs, sheets, toasts).
  - With templates plus sprinkles, each control is built twice: markup in the template and behavior in hand-wired JS. Keeping them in sync is exactly where the old version became janky.
  - No shared component model between the server and the browser.
  - Routing, CSRF, sessions, layouts, and asset pipeline all have to be assembled by hand.

### B. SvelteKit 2 with Svelte 5 on Node (`adapter-node`) — **recommended**

- **Pros**
  - **Server-rendered by default.**
    - Public pages arrive as real HTML, so they load fast on phones.
    - Only the interactive parts ship JavaScript, and Svelte's runtime is very small.
    - The program page can ship almost no JS.
  - **Each custom control is one component** (markup, behavior, and styles together) and is used everywhere. This is what makes "no default control skins, and consistent everywhere" achievable for one maintainer.
  - **No-reload interactions come built in.**
    - Form actions and `use:enhance` give instant feedback.
    - Toasts replace redirects, and optimistic UI works without a hand-built client router.
  - **Server-only code is enforced.**
    - Code under `src/lib/server/` can't be imported into browser code; the build fails if it is.
    - That keeps the routes → handlers → services → data layering honest.
  - **Hooks** handle sessions, CSRF, the theme cookie (so the correct theme is in the first byte of HTML, with no flash), rate limits, and security headers in one place.
  - **It's close to plain HTML, CSS, and JS.** A `.svelte` file is basically an HTML file with a `<script>` and a `<style>`, which fits Kevin's background.
  - **Tooling:** Vite HMR in development, Vitest for tests, `svelte-check` for type and template checking, Playwright for browser tests. All of it runs on Windows.
- **Cons**
  - Svelte itself is new to learn, though it's a small surface.
  - File-based routing uses fixed file names (`+page.svelte`, `+page.server.js`). Those follow the framework convention, not Kevin's naming style.
  - The ecosystem is smaller than React's. Everything we need exists and works without React:
    - Tiptap (framework-agnostic)
    - an accessible drag-and-drop library
    - Lucide icons

### C. Next.js 15 (React)

- **Pros**
  - The largest ecosystem and plenty of UI kits.
- **Cons**
  - Heavier client bundles, which hurts the phone-first public pages.
  - The React Server Components and caching model is complex and changes often, which makes it the hardest of the three for one person to maintain.
  - React adds more ceremony for the same UI.

## Recommendation: SvelteKit 2 + Svelte 5, JavaScript with JSDoc types

| Concern | Choice | Why |
|---|---|---|
| Framework | SvelteKit 2 (Svelte 5 runes), `adapter-node` | See above |
| Language | JavaScript + JSDoc types, checked by `svelte-check` | Keeps Kevin's language and still catches type errors. TypeScript is a drop-in alternative; see Questions. |
| Database driver | `postgres` (porsager) | Tagged-template queries are always parameterized; there is no way to build a query by string concatenation. Fast, with no native build step. |
| Migrations | Plain `NNN_name.up.sql` / `NNN_name.down.sql` files plus a ~100-line runner script | Every migration has a real down step, the SQL is readable, and there's no ORM. |
| Validation | Valibot schemas shared by client and server | The same rules show inline errors in the browser and are re-enforced on the server. |
| Passwords | `node:crypto` scrypt (N=2^15, r=8, p=1), `timingSafeEqual` | Built in, so nothing native to compile on Windows. |
| Sessions | Our own `sessions` table storing only a SHA-256 hash of the cookie token | The cookie is HttpOnly and SameSite=Lax, and Secure in production. A leaked database doesn't leak live sessions. |
| CSRF | SvelteKit's origin check, plus our hook that requires a same-origin `Origin`/`Sec-Fetch-Site` **and** a per-session token header on every non-GET request, including JSON API calls | "CSRF on every change-making request" holds for both form posts and fetches. |
| Rate limits | A Postgres fixed-window counter table | Survives restarts and needs no Redis. Applied to auth and all public writes. |
| Rich text | Tiptap (ProseMirror). Sanitized on the server with `sanitize-html` using the allowlist from the brief. | We store both the editor JSON and the sanitized HTML. |
| Drag and drop | `svelte-dnd-action` (keyboard-accessible), plus our own keyboard reorder commands | The editor must work fully by keyboard. |
| Dates and zones | Calendar dates as plain `YYYY-MM-DD` strings with pure functions; Luxon only where a real time zone is involved (today in the event zone, ICS UTC times) | Avoids the old code's `Date` and UTC day-shift bugs. |
| Mail | A `mailer` interface with `log` (development) and `smtp` (nodemailer) transports | Pluggable, as the brief requires. |
| Fonts and icons | Inter Variable self-hosted (`@fontsource-variable/inter`); `@lucide/svelte` | No third-party font request, so no FOUT from a CDN. |
| Tests | Vitest (unit, service, and route tests against the real `progr_am_test` database); Playwright (browser flows plus the screenshot pass in both themes at 390 px and 1280 px) | |
| Lint and format | ESLint 9 flat config + `eslint-plugin-svelte` + `@stylistic/eslint-plugin`, **no Prettier** | Prettier would delete the required blank line after a function declaration. `@stylistic` can express Kevin's style: tabs, Stroustrup braces, up to 4 blank lines. We add one small local rule that requires exactly one blank line after a function declaration line. |

npm scripts, all cross-platform with no shell-specific syntax:

- `dev`
- `build`
- `preview`
- `check` (svelte-check)
- `lint`
- `test` (Vitest)
- `test:e2e` (Playwright)
- `db:migrate`
- `db:rollback`
- `db:seed`
- `db:reset:test`
- `verify`: check, then lint, then test. This is the milestone gate.

## Hosting (cheap, later)

1. **Kevin's home server behind a Cloudflare Tunnel.** Costs $0.
   - Node runs as a Windows service (NSSM or `node-windows`) next to the existing Postgres.
   - `cloudflared` publishes progr.am without opening ports.
   - This is good for the temporary domain and early use.
2. **Small VPS (Hetzner CX22, about €4–5/month).**
   - Node, Postgres, and Caddy for automatic HTTPS on one box, deployed with `git pull && npm ci && npm run build`, plus nightly `pg_dump` to object storage.
   - This is the recommended step once real events depend on it.
3. **Managed:** Render or Fly.io for the app plus Neon's free Postgres tier. The least ops work, but with cold starts on free tiers.

The public base URL is configuration (`PUBLIC_BASE_URL`, default `https://progr.am`), so any of these can run on a temporary domain first.
