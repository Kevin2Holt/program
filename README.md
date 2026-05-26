# progr.am

`progr.am` is a server-rendered web application for creating and viewing event
programs and itineraries. Event organizers create structured programs, and
attendees access them through short event-code URLs (`prog.am/<CODE>`).

This repository is the long-term home for the full `progr.am` application. The
current implementation status focuses on the **calendar signup module**, which
lives at `/:code/calendar` publicly and at `/events/:eventId/calendar/...` for
organizers.

## Stack

- Node.js + Express
- EJS server-rendered templates with partials
- PostgreSQL
- Session-backed authentication (pg-backed store)
- CSRF protection, rate limiting, sanitization
- No bundler — client-side enhancement via plain JS and importmap/CDN where
  needed

## Layout

```
src/
  config/         App configuration (env, db pool, session)
  controllers/    HTTP orchestration (public/, organizer/)
  db/             DB pool, migration runner, SQL migrations
  middleware/     attach-user, require-auth, CSRF, rate limiting, permissions
  models/         Data access (one module per entity)
  routes/         Route registration (public + organizer)
  services/       Business logic (booking, availability, export, etc.)
  views/          EJS templates
    layouts/      Application layouts (main, public-event)
    partials/     Shared partials (header, footer, flash, calendar bits)
    public/       Public-facing pages
    events/       Organizer event-management pages
public/
  css/            Stylesheets (custom-property based, dark default)
  js/             Client-side scripts (progressive enhancement only)
.github/workflows/ CI (lint, test, syntax check)
test/             Tests
```

## Phase 4A scope

Phase 4A is the *foundation* layer of the calendar signup module:

- Project scaffolding (Express app, session, CSRF, view engine, static assets)
- PostgreSQL schema and migrations for the calendar entities
- Models with CRUD-oriented helpers and archive-friendly methods
- Service-layer modules (config, items, occurrences, availability, booking,
  export, permissions) with meaningful structure and clear TODO markers
- Route registration for both the public `/:code/calendar` family and the
  organizer `/events/:eventId/calendar` family, with route-ordering care so
  the generic public `/:code` route never swallows calendar URLs
- Calendar permission constants and permission middleware
- Minimal EJS views/layouts/partials to verify integration
- Initial tests for models, route registration, permissions, and helpers
- GitHub Actions CI for lint / test / syntax-check

Subsequent phases (4B+) flesh out organizer setup, item management, occurrence
support, availability rules, the public booking flow, organizer booking
management, CSV export, polish, and merge-readiness review.

## Getting started

```bash
cp .env.example .env
npm install
npm run migrate
npm run dev
```

## Repository conventions

- Default branch: `main`
- Trunk-based development with short-lived feature branches
- Layered commits: scaffold → schema → app/middleware → models/services →
  routes/controllers → views/partials → static assets / CI

## License

Private / internal.
