# progr.am

progr.am has two parts:

- **Event programs** that people read on their phones.
- **Signup calendars** for meals, sessions, or volunteer slots. They never double-book.

## Quick start (Windows, PowerShell)

1. Install Node.js 22+ and PostgreSQL 17.
2. Create the app user and two databases (`progr_am_dev`, `progr_am_test`).
3. Copy the example config, then set the two database URLs in `.env`:

   ```bash
   copy .env.example .env
   ```

4. Install and prepare:

   ```bash
   npm install
   ```

   ```bash
   npm run db:migrate
   ```

5. Start the dev server and open http://localhost:5173:

   ```bash
   npm run dev
   ```

Checks:

```bash
npm run verify
```

```bash
npm run test:e2e
```

- **For developers and agents:** see [CLAUDE.md](CLAUDE.md) for architecture and conventions.
- **For the plan and design system:** see [docs/rebuild/](docs/rebuild/README.md).

## Production

Build it, then start it:

```bash
npm run build
```

```bash
node build
```

Set these environment variables:

- `NODE_ENV=production`
- `ORIGIN` (the site's public URL)
- `DATABASE_URL`
- `PUBLIC_BASE_URL`
- the mail settings in `.env.example`
