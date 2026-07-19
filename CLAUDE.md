# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

`vigab.cc` is a private URL-shortener. It stores destination URLs in PostgreSQL, redirects `/<shortCode>` (or an alias) to the destination, tracks clicks with privacy-preserving analytics, and provides an authenticated dashboard for managing URLs, aliases, tags, stars, and QR-code downloads.

## Commands

```bash
pnpm install                 # install dependencies (pnpm@10.18.1 required)
pnpm dev                     # Next dev/Turbopack on port 6111
pnpm build                   # production build
pnpm check                   # Biome lint/format check
pnpm check:fix               # apply Biome fixes
pnpm exec biome ci .         # CI's Biome command
pnpm test                    # vitest run (unit tests)
pnpm test:watch              # vitest watch mode
```

CI runs `pnpm exec biome ci .` and `pnpm run build` with `SKIP_ENV_VALIDATION=true`.

## Architecture

### Entry points

```
src/app/[shortCode]/page.tsx          lookup, click recording, redirect
src/app/admin/page.tsx                session-gated dashboard
src/app/api/[...ts-rest]/route.ts     REST implementation, base path /api
src/app/api/auth/[...nextauth]/       NextAuth handlers
src/app/api/route.tsx                 Scalar API docs at /api
src/app/openapi.json/route.ts         OpenAPI doc generated from contract
```

### Library

```
src/lib/contract.ts          ts-rest routes — the API source of truth
src/lib/url-service.ts       all DB operations on urls/url_aliases/url_tags
src/lib/analytics-service.ts click recording + aggregated analytics queries
src/lib/analytics-schema.ts  Zod schemas for analytics tables
src/lib/geo.ts               country detection from request IP
src/lib/db.ts                pg.Pool singleton; schema init + idempotent migrations
src/lib/auth.ts              Google OAuth; single-email allow-list via ALLOWED_EMAIL
src/lib/schemas.ts           Zod types for DB rows and API responses
src/lib/validations.ts       Zod input schemas (create, patch, tags)
src/lib/qr-config.ts         QR option source of truth
src/env.ts                   @t3-oss/env-nextjs validated env definition
src/hooks/urls.ts            TanStack Query hooks for the dashboard
```

### Change cascade

When changing an API: update `contract.ts` → `validations.ts`/`schemas.ts` → `url-service.ts` or `analytics-service.ts` → `src/app/api/[...ts-rest]/route.ts`. Schema changes go in `initDatabase()`/`migrateDatabase()` in `db.ts` as idempotent SQL.

## Database

Uses `pg.Pool` with raw SQL; no ORM. Connection: `DB_URL` (or `DATABASE_URL`), or component vars `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASS`/`DB_NAME`.

Tables and their cascade behaviour:

- `urls` — primary records; `url_aliases.url_id` and `url_tags.url_id` cascade on delete.
- `url_aliases` — alias codes pointing to a `urls` row.
- `url_tags` — tags per URL.
- `click_analytics_buckets` — aggregated click + unique-visitor counts per (url_id, alias_id, bucket_type, bucket_start). `alias_id = -1` is the link-wide scope, `0` is the primary code, `>0` is a specific alias id.
- `click_country_analytics` — per-day country breakdown (no PII stored).
- `daily_unique_click_dedup` — transient HMAC hashes used for same-day unique dedup; purged after `DEDUP_RETENTION_DAYS` (1 day). IPs and User-Agents are **never written to any table**.

Schema changes go in `initDatabase()` / `migrateDatabase()` in `db.ts` as idempotent SQL. There is no migration history or transaction wrapper. `SKIP_ENV_VALIDATION` also skips startup migration (suitable for builds, not runtime).

## Authentication and authorization

NextAuth with Google only (`src/lib/auth.ts`). Sign-in requires `ALLOWED_EMAIL`. `/admin` redirects unauthenticated users to `/api/auth/signin?callbackUrl=/admin`.

**The ts-rest handlers contain no session checks.** `/api/urls` and mutations are not protected at the application layer — security must be enforced externally (e.g. Cloudflare Access). The OpenAPI doc declares CF Access header schemes but the handlers do not validate them.

## Routing and URL behaviour

- Static Next routes take precedence over `[shortCode]`.
- `getUrlByShortCode()` accepts both primary codes and alias codes.
- `next.config.ts` has a `beforeFiles` rewrite mapping `/` to `https://vigab-links.vercel.app`.
- Short URLs are always `https://${env.NEXT_PUBLIC_DOMAIN}/${short_code}`. `NEXT_PUBLIC_DOMAIN` is read from `process.env.DOMAIN` in `src/env.ts`; setting only `NEXT_PUBLIC_DOMAIN` is ineffective.
- Custom codes: 2–25 chars `[a-zA-Z0-9_-]`. Generated codes: 8-char nanoid. Alias codes use the same validation and are checked against both primary codes and other aliases. Collisions on generated codes are not retried.
- `PUT`/`DELETE` on `/urls/:shortCode` targets the **primary** code; they do not work via alias.
- Click recording is fire-and-forget (`recordClickSafely` never throws; errors only log).

## Analytics

`AnalyticsService` (singleton `analyticsService`) is the only path for recording and querying clicks. It uses HMAC-SHA256 keyed with `ANALYTICS_HASH_SECRET` (falls back to `NEXTAUTH_SECRET`) to produce a daily rotating visitor hash — no cookies, no fingerprinting. `geo.ts` extracts the country from `CF-IPCountry` (or similar headers).

Tests for pure helpers (hash, bucket truncation) are in `src/lib/analytics-service.test.ts` and `src/lib/geo.test.ts`, using `pg-mem` for DB-backed paths.

## Environment

- Required: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`.
- Domain/port: `DOMAIN` (default `vigab.cc`), `PORT` (default `6111`), optional `NEXTAUTH_URL`.
- Database: `DB_URL` or `DATABASE_URL`; or component vars (default `DB_PORT=5432`).
- Optional: `ANALYTICS_HASH_SECRET` (preferred over reusing `NEXTAUTH_SECRET`), `GITHUB_ID`, `GITHUB_SECRET`.

## Conventions

- `@/` imports for `src/`, strict TypeScript, 2-space / no-semicolon / Biome formatting, ES5 trailing commas.
- `cn()` for conditional Tailwind class composition; reuse shadcn primitives from `src/components/ui/`.
- Biome explicitly excludes `src/app/globals.css` and `src/components/ui/*` — edit intentionally, expect no auto-formatting.
- Client-only code must be in `"use client"` components. The dashboard fetches `/api/...` directly; there is no generated API client.
- Do not edit `.next/`, `next-env.d.ts`, or `tsconfig.tsbuildinfo`.

## Before finishing

- Update every affected contract, validation, handler, service, and UI path.
- For URL/alias changes: verify primary-code and alias behaviour, collision handling, and redirect/click effects.
- Schema changes must be idempotent and compatible with existing databases.
- Run `pnpm exec biome ci .` and `pnpm build` (or state why either cannot run).
