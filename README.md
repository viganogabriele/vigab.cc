# vigab.cc

> A self-hosted URL shortener with an authenticated dashboard, first-class
> aliases, QR codes, and privacy-conscious click analytics.

`vigab.cc` turns long URLs into short, memorable links and provides the tools to
manage them over time. It is intentionally small in scope, but built as a
production-minded full-stack application: typed API contracts, runtime
validation, PostgreSQL persistence, Google authentication, and generated API
documentation all live in one codebase.

## Highlights

- Create generated or custom short codes and keep multiple aliases for a link.
- Organise links with tags and stars; manage everything from a responsive
  dashboard.
- Track clicks, last activity, and aggregated analytics without cookies.
- Produce downloadable plain or styled QR codes directly in the browser.
- Publish a typed REST API with live Scalar docs at `/api` and OpenAPI JSON at
  `/openapi.json`.
- Run it with PostgreSQL locally or as a small standalone Docker image.

## Why this project

This is a practical exercise in shipping and evolving a focused product rather
than a demo. The application keeps its data model explicit, owns its SQL, and
uses a single API contract to drive validation, handlers, and documentation.
That makes the codebase easy to inspect, change, and operate.

### Technical decisions at a glance

| Area | Choice | Why |
| --- | --- | --- |
| Front end | Next.js 15, React 19, TypeScript | A modern, typed full-stack application with App Router. |
| API | ts-rest + Zod | One contract for request validation, responses, and OpenAPI output. |
| Data | PostgreSQL + `pg` | Direct SQL and a transparent schema—no ORM or migration framework required. |
| Auth | NextAuth + Google OAuth | A simple, familiar sign-in flow for the private dashboard. |
| UI | Tailwind CSS, shadcn/ui, TanStack Query | Accessible primitives and responsive, cache-aware client interactions. |
| Analytics | Server-side, aggregated events | Useful link insights without cookie-based tracking. |

## Features

- **Short links and aliases** — Resolve a primary short code or any alias to
  the same destination; clicks are counted on the owning link.
- **Link management** — Create, rename, delete, tag, star, and search links
  from the authenticated dashboard.
- **Analytics** — See click volume, recent activity, and per-route aggregates.
- **QR codes** — Generate canvas-based QR codes with plain/styled and
  white/transparent variants.
- **API-first design** — Browse and try the REST API at `/api`; consume its
  generated OpenAPI document at `/openapi.json`.

## Architecture

```text
Browser dashboard ──► Next.js routes / ts-rest handler ──► UrlService ──► PostgreSQL
        │                         │                              │
        └── TanStack Query        └── OpenAPI + Scalar docs      └── URLs, aliases, tags, analytics

Short-link request ──► /[shortCode] ──► resolve code or alias ──► count click ──► redirect
```

`src/lib/contract.ts` is the API source of truth. `UrlService` owns database
access, while Zod validates data at API and database boundaries. Database setup
and compatible schema updates run on application startup.

## Getting started

### Prerequisites

- Node.js 24+
- pnpm 10+
- PostgreSQL
- A Google OAuth application for dashboard sign-in

### Install and run

```bash
git clone <repository-url>
cd vigab.cc
pnpm install
```

Create `.env.local`:

```env
NODE_ENV=development
PORT=6111
DOMAIN=localhost:6111
NEXTAUTH_URL=http://localhost:6111

DB_URL=postgresql://user:password@localhost:5432/vigab

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=replace-with-a-long-random-secret
ANALYTICS_HASH_SECRET=replace-with-a-different-long-random-secret
```

Then start the development server:

```bash
pnpm dev
```

Open `http://localhost:6111`. With a valid database configuration, the
application creates and updates its required tables on startup.

`DATABASE_URL` can be used instead of `DB_URL`; component-based PostgreSQL
variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME`) are also
supported. `DOMAIN` is the value used when displaying and encoding short URLs;
setting `NEXT_PUBLIC_DOMAIN` by itself is not sufficient in this project.

### Authentication

The `/admin` dashboard uses Google OAuth. The allowed email address is currently
configured in `src/lib/auth.ts`; update it before deploying your own instance.

For local dashboard work without OAuth, set both `NODE_ENV=development` and
`ALLOW_ANONYMOUS_LOCAL_ADMIN=true`. This development-only opt-in bypasses the
admin session check; Google OAuth remains the production access path.

## Commands

```bash
pnpm dev                 # Start development server on port 6111
pnpm build               # Create a production build
pnpm start               # Serve the production build
pnpm check               # Run Biome checks
pnpm check:fix           # Apply Biome fixes
pnpm test                # Run Vitest tests
pnpm docker:build        # Build the Docker image
```

For CI builds that do not have runtime secrets available, use
`SKIP_ENV_VALIDATION=true`. Do not use it in production: it also disables the
startup database initialization.

## Docker

```bash
pnpm docker:build
docker run --env-file .env.local -p 6111:6111 tmsu-cc
```

Keep `DOMAIN`, `NEXTAUTH_URL`, the Google OAuth callback URL, and the public
deployment URL aligned.

## Security and privacy notes

- Analytics derives a daily visitor hash server-side and does not require
  cookies; configure `ANALYTICS_HASH_SECRET` for a dedicated stable secret.
- Never commit `.env.local`, OAuth secrets, or database credentials.
- The dashboard is authenticated, but API handlers do not currently enforce
  session or role checks in application code. Protect `/api` at the edge or add
  application-level authorization before exposing write endpoints publicly.

## Project lineage and credits

This project is based on the original URL shortener by
[ToTo04](https://github.com/ToTo04). It was then developed from the version
made for [PoliNetwork](https://github.com/polinet.cc).

The current iteration is maintained and expanded by **Gabriele**. It is built
through an AI-assisted, hands-on development workflow using **Claude** and
**Codex** as tools; product direction, implementation choices, reviews, and
responsibility remain with the maintainer.

The project acknowledges its upstream work clearly and aims to keep that
lineage visible as it evolves.

## License

MIT
