# AGENTS.md

## Purpose

`vigab.cc` is a private URL-shortener application. It stores destination URLs in
PostgreSQL, redirects `/<shortCode>` (or an alias) to the destination, counts
clicks, and provides an authenticated dashboard for managing URLs, aliases,
tags, stars, and QR-code downloads. Its API contract also generates OpenAPI
documentation.

## Stack and commands

- Node.js 24 (used by CI and `Dockerfile`), TypeScript, Next.js 15 App Router,
  React 19, and Turbopack.
- PostgreSQL through `pg` and raw SQL; there is no ORM or external migration
  tool.
- `next-auth` v4 with Google OAuth, `@ts-rest/*` for the API contract/handler,
  Zod for validation, TanStack Query for dashboard fetching, and
  Tailwind CSS 4 + shadcn/Radix UI.
- pnpm is required: the pinned package manager is `pnpm@10.18.1`; keep
  `pnpm-lock.yaml` in sync with dependency changes.

```bash
pnpm install                 # install dependencies
pnpm dev                     # Next dev/Turbopack on port 6111
pnpm build                   # production build/Turbopack
pnpm start                   # serve the production build
pnpm check                   # Biome check (the package script has no path)
pnpm check:fix               # apply Biome fixes
pnpm exec biome ci .         # CI's Biome command
pnpm build:analyze           # bundle analysis; skips env validation
pnpm docker:build            # build the production image
pnpm docker:run              # run it, publishing 6111
```

There is no dedicated unit/integration test script or test directory. CI runs
`pnpm exec biome ci .` and `pnpm run build` with `SKIP_ENV_VALIDATION=true`.

## Layout and entry points

```
src/app/                         Next routes and root layout
  [shortCode]/page.tsx            lookup, click count, redirect
  admin/page.tsx                  session-gated dashboard page
  api/[...ts-rest]/route.ts       REST implementation, base path /api
  api/auth/[...nextauth]/route.ts NextAuth handlers
  api/route.tsx                   Scalar API reference at /api
  openapi.json/route.ts           generated-at-request OpenAPI document
src/lib/
  contract.ts                     ts-rest route/request/response source of truth
  validations.ts, schemas.ts      Zod input and database/API shapes
  url-service.ts                  URL business logic and SQL operations
  db.ts                           Pool, schema initialization, startup migrations
  auth.ts                         Google provider and email allow-list
  qr-config.ts                    QR option source of truth
src/components/                  dashboard and feature components
src/components/ui/               shadcn-style primitive components
src/hooks/urls.ts                dashboard API-query hooks
src/env.ts                       validated environment definition
```

`src/app/layout.tsx` installs React Query, tooltip, and Sonner providers.
Interactive components are marked `"use client"`; routes and service code run
on the server. The dashboard calls `/api/...` directly with `fetch`; it does
not use a generated API client.

## API and data architecture

Treat `src/lib/contract.ts` as the API source of truth. When changing an API,
update the contract, Zod validation/schema, `UrlService` as needed, and the
matching implementation in `src/app/api/[...ts-rest]/route.ts`. The latter
uses `createNextHandler` with `basePath: "/api"`; `/openapi.json` is generated
from the contract and `/api` displays it through Scalar.

`UrlService` owns all database access. It validates database result shapes with
`URLRecord`/`URLRecords` before returning them. URL rows have a primary code,
destination, custom/starred flags, timestamps, and `click_count`; aliases live
in `url_aliases`; tags live in `url_tags`. `url_aliases.url_id` and
`url_tags.url_id` cascade on URL deletion.

## Database and migrations

`src/lib/db.ts` creates one lazy `pg.Pool`. It prefers `DB_URL` (also sourced
from `DATABASE_URL`) and otherwise uses `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASS`, and `DB_NAME`.

On module initialization—unless `SKIP_ENV_VALIDATION` is set—it asynchronously
creates the `urls` and `url_aliases` tables/indexes, then runs idempotent SQL
(`ALTER TABLE ... IF NOT EXISTS`, `CREATE TABLE ... IF NOT EXISTS`) to add
`is_starred`, preserve the older nullable `urls.tag` column, create `url_tags`,
and copy existing `urls.tag` values into it. There is no migration history,
transaction wrapper, or migration command. Put compatible, idempotent schema
changes in `initDatabase()`/`migrateDatabase()` and preserve the ordering.

`SKIP_ENV_VALIDATION` suppresses that startup initialization as well as env
validation, so it is suitable for builds but not a substitute for a configured
runtime database.

## Authentication and authorization

NextAuth is configured only with Google in `src/lib/auth.ts`. Sign-in succeeds
only when Google reports the one hard-coded `ALLOWED_EMAIL` in that file.
`/admin` calls `getServerSession(authOptions)` and sends unauthenticated users
to `/api/auth/signin?callbackUrl=/admin`.

Important: the ts-rest handlers and server actions contain no session/role
checks. Therefore the application code itself does **not** protect `/api/urls`,
`/api/tags`, or mutations there. The OpenAPI document declares Cloudflare Access
header schemes, but the handlers do not validate those headers. Do not assume
API authorization exists unless it is implemented here or enforced externally.

## Routing, domains, aliases, clicks, and QR codes

- Static Next routes take precedence over `[shortCode]`; unknown top-level
  paths are looked up by `getUrlByShortCode()`. That method accepts either
  `urls.short_code` or a matching `url_aliases.alias_code`.
- `next.config.ts` has a `beforeFiles` rewrite mapping `/` to
  `https://vigab-links.vercel.app`. This precedes the otherwise empty
  `src/app/page.tsx`; preserve/adjust it deliberately when changing root
  behavior.
- Short URLs displayed and encoded by the UI are always
  `https://${env.NEXT_PUBLIC_DOMAIN}/${short_code}`. In `src/env.ts`, the
  runtime value exposed as `NEXT_PUBLIC_DOMAIN` is read from `process.env.DOMAIN`;
  setting only `NEXT_PUBLIC_DOMAIN` is not effective in this configuration.
- A custom code must be 2–25 characters of `[a-zA-Z0-9_-]`. Generated primary
  codes are eight-character `nanoid`s. Aliases use the same validation and are
  checked against both primary codes and other aliases. Database unique
  constraints remain the final guard; generated-code collisions are not
  retried by the service.
- Updating/deleting a URL targets a **primary** `short_code`; resolving an alias
  first and then calling these methods will not update/delete by alias. Alias
  tag endpoints resolve aliases to the owning URL first.
- `/<shortCode>` starts `incrementClickCount(shortCode)` without awaiting it,
  then redirects with `RedirectType.push`. Failed increments only log errors;
  every successful resolution (primary or alias) increments the same URL row.
- QR generation is client-side in `src/components/qr-code.tsx` using canvas and
  `qr-code-styling`. `src/lib/qr-config.ts` is the option source of truth:
  plain/styled and white/transparent. Styled codes embed `src/assets/logo.png`
  and use error correction `Q`; plain uses `M`.

## Environment

Use `.env.local` locally; it is ignored. `.env.example` documents only a subset
of database/port variables and must not be treated as a complete runnable
configuration. `src/env.ts` verifies the actual names and defaults:

- Required: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`.
- Domain/port: `DOMAIN` (default `vigab.cc`), `PORT` (default `6111`),
  `NODE_ENV` (`development` or `production`), optional `NEXTAUTH_URL`.
- Database: `DB_URL` or `DATABASE_URL`; alternatively the optional component
  variables above (`DB_PORT` defaults to `5432`).
- Optional, currently declared but not used by the auth provider: `GITHUB_ID`
  and `GITHUB_SECRET`.

Never commit `.env`, `.env.local`, credentials, OAuth secrets, or database URLs.

## Conventions and generated files

Use `@/` imports for `src/`, strict TypeScript, Zod schemas at trust boundaries,
and existing 2-space/no-semicolon/Biome formatting. Biome organizes imports and
uses ES5 trailing commas. Keep client-only browser code inside client
components. Reuse `cn()` for conditional Tailwind class composition and the
existing shadcn primitives from `src/components/ui/`.

Do not manually edit generated/ignored build artifacts: `.next/`,
`next-env.d.ts`, or `tsconfig.tsbuildinfo`. `biome.jsonc` explicitly excludes
`src/app/globals.css` and `src/components/ui/*` from checks because they are
shadcn-modified; edit them only intentionally and do not expect Biome to format
or lint them.

## Before finishing

- Update every affected contract, validation, handler, service, and UI path.
- Check primary-code and alias behavior, including collision and redirect/click
  effects, for URL changes.
- Keep schema changes idempotent and compatible with existing databases.
- Run `pnpm exec biome ci .` and `pnpm build` (or state why either cannot run).
- Confirm no ignored build output or local environment files were added.
