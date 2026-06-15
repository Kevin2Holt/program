# progr.am

`progr.am` is a server-rendered web application for creating and viewing event
programs and itineraries. Event organizers create structured programs, and
attendees access them through short event-code URLs (`progr.am/<CODE>`).

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
