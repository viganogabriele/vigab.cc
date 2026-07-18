import { createHmac } from "node:crypto"
import type { Pool } from "pg"
import { env } from "@/env"
import { getPool } from "./db"
import { UNKNOWN_COUNTRY } from "./geo"
import {
  AnalyticsResult,
  type AnalyticsResult as AnalyticsResultType,
} from "./schemas"

// ── Scope sentinels (stored in the `alias_id` column) ────────────────────────
// A click is recorded against two scopes so we can report unique visitors both
// per-route and for the whole link without double counting:
//   -1 → the entire link (any of its routes)
//    0 → the primary short_code route
//   >0 → a specific alias (url_aliases.id)
export const LINK_SCOPE = -1
export const PRIMARY_SCOPE = 0

// Deduplication rows only need to survive for same-day dedup. We keep today and
// yesterday (≈24–48h) as a small buffer around the UTC day boundary, then purge.
export const DEDUP_RETENTION_DAYS = 1

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000

// ── Pure, side-effect-free helpers (unit-testable without a database) ─────────

/** UTC calendar date as `YYYY-MM-DD`. The dedup hash rotates on this value. */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Truncate to the start of the UTC hour. */
export function hourBucket(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours()
    )
  )
}

/** Truncate to the start of the UTC day. */
export function dayBucket(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Truncate to the start of the UTC month. */
export function monthBucket(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** Keep only a valid ISO alpha-2 code, otherwise report as Unknown. */
export function normalizeCountry(country: string | null | undefined): string {
  if (!country) return UNKNOWN_COUNTRY
  const code = country.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : UNKNOWN_COUNTRY
}

/**
 * Derive the daily, per-scope visitor hash used to estimate unique clicks
 * WITHOUT cookies or fingerprinting.
 *
 * Privacy properties:
 *  - HMAC-SHA256 keyed with a server-side secret → not reversible/guessable.
 *  - `dateStr` is part of the message, so the hash ROTATES every UTC day. The
 *    same visitor produces a different hash tomorrow → no cross-day tracking.
 *  - `scopeToken` binds the hash to a single link/route → reduces linkability
 *    across different links.
 *  - The raw IP and User-Agent are inputs only; they are never returned or
 *    stored. Only this digest may be persisted, and only transiently.
 */
export function computeDailyVisitorHash(
  secret: string,
  input: { scopeToken: string; dateStr: string; ip: string; userAgent: string }
): string {
  return createHmac("sha256", secret)
    .update(
      `${input.scopeToken}|${input.dateStr}|${input.ip}|${input.userAgent}`
    )
    .digest("hex")
}

interface BucketRow {
  alias_id: number
  bucket_type: string
  bucket_start: Date
  clicks_count: number
  unique_estimated_count: number
}

interface CountryRow {
  alias_id: number
  country_code: string
  clicks: number
}

export interface RecordClickInput {
  urlId: number
  /** 0 for the primary short_code, or the url_aliases.id when an alias was hit. */
  aliasId: number
  /** Transient. Used only to derive the hash + country, never stored. */
  ip: string
  /** Transient. Used only to derive the hash, never stored. */
  userAgent: string
  /** Country code or "Unknown". */
  country: string
  /** Injectable clock for tests. */
  at?: Date
}

export class AnalyticsService {
  private pool: Pool
  private secret: string

  constructor(opts?: { pool?: Pool; secret?: string }) {
    this.pool = opts?.pool ?? getPool()
    // Fall back to NEXTAUTH_SECRET (always server-side, never hardcoded) so the
    // feature works out of the box; a dedicated ANALYTICS_HASH_SECRET is better.
    this.secret =
      opts?.secret ?? env.ANALYTICS_HASH_SECRET ?? env.NEXTAUTH_SECRET
  }

  /**
   * Record a single click into the aggregated analytics tables.
   *
   * The IP and User-Agent arrive only as function arguments, are consumed to
   * derive the country + daily hashes, and go out of scope when this returns.
   * They are NEVER written to any table, log, or error message.
   */
  async recordClick(input: RecordClickInput): Promise<void> {
    const now = input.at ?? new Date()
    const dateStr = utcDateString(now)
    const country = normalizeCountry(input.country)

    const buckets = [
      ["hour", hourBucket(now)],
      ["day", dayBucket(now)],
      ["month", monthBucket(now)],
    ] as const

    // Two scopes per click: the specific route, and the whole link.
    const scopes = [
      { aliasId: input.aliasId, token: `${input.urlId}:${input.aliasId}` },
      { aliasId: LINK_SCOPE, token: `${input.urlId}:link` },
    ]

    for (const s of scopes) {
      // Derive the (non-reversible) per-scope daily hash. After this iteration
      // the raw ip/userAgent are not referenced by anything we persist.
      const hash = computeDailyVisitorHash(this.secret, {
        scopeToken: s.token,
        dateStr,
        ip: input.ip,
        userAgent: input.userAgent,
      })

      // First sighting of this visitor today (for this scope) → count a unique.
      // The unique constraint makes this atomic: concurrent duplicate clicks
      // race on the insert and exactly one wins, so we never over-count.
      const uniqueDelta = (await this.insertDedup(
        input.urlId,
        s.aliasId,
        dateStr,
        hash
      ))
        ? 1
        : 0

      for (const [type, start] of buckets) {
        await this.pool.query(
          `INSERT INTO click_analytics_buckets
             (url_id, alias_id, bucket_type, bucket_start, clicks_count, unique_estimated_count)
           VALUES ($1, $2, $3, $4, 1, $5)
           ON CONFLICT (url_id, alias_id, bucket_type, bucket_start)
           DO UPDATE SET
             clicks_count = click_analytics_buckets.clicks_count + 1,
             unique_estimated_count =
               click_analytics_buckets.unique_estimated_count + $5,
             updated_at = CURRENT_TIMESTAMP`,
          [input.urlId, s.aliasId, type, start, uniqueDelta]
        )
      }

      await this.pool.query(
        `INSERT INTO click_country_analytics
           (url_id, alias_id, bucket_date, country_code, clicks_count)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (url_id, alias_id, bucket_date, country_code)
         DO UPDATE SET
           clicks_count = click_country_analytics.clicks_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [input.urlId, s.aliasId, dateStr, country]
      )
    }
  }

  /**
   * Insert a dedup row. Returns true if this visitor/scope/day was not seen
   * before, false if it already existed (unique-violation). Never stores the
   * raw IP/UA — only the hash.
   */
  private async insertDedup(
    urlId: number,
    aliasId: number,
    dateStr: string,
    hash: string
  ): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO daily_unique_click_dedup (url_id, alias_id, bucket_date, daily_visitor_hash)
         VALUES ($1, $2, $3, $4)`,
        [urlId, aliasId, dateStr, hash]
      )
      return true
    } catch (e) {
      // 23505 = unique_violation → already counted today for this scope.
      if ((e as { code?: string }).code === "23505") return false
      throw e
    }
  }

  /**
   * Record a click but never throw — analytics must not break the redirect.
   * On failure it logs a generic, non-sensitive message (no IP/UA) and returns
   * false. Returns true when the click was recorded.
   */
  async recordClickSafely(input: RecordClickInput): Promise<boolean> {
    try {
      await this.recordClick(input)
      return true
    } catch {
      console.error("Failed to record click analytics")
      return false
    }
  }

  /** Delete deduplication rows older than the retention window. */
  async purgeExpiredDedup(opts?: {
    at?: Date
    retentionDays?: number
  }): Promise<number> {
    const now = opts?.at ?? new Date()
    const retentionDays = opts?.retentionDays ?? DEDUP_RETENTION_DAYS
    const cutoff = utcDateString(
      new Date(now.getTime() - retentionDays * 86_400_000)
    )
    const res = await this.pool.query(
      "DELETE FROM daily_unique_click_dedup WHERE bucket_date < $1",
      [cutoff]
    )
    return res.rowCount ?? 0
  }

  /**
   * Build the aggregated analytics payload for a short code (its primary route,
   * every alias, and the link total). Returns null if the code is unknown.
   */
  async getAnalytics(
    shortCode: string,
    at?: Date
  ): Promise<AnalyticsResultType | null> {
    const now = at ?? new Date()

    const urlRes = await this.pool.query(
      `SELECT id, short_code FROM urls u
       WHERE u.short_code = $1
          OR u.id = (SELECT url_id FROM url_aliases WHERE alias_code = $1 LIMIT 1)
       LIMIT 1`,
      [shortCode]
    )
    if (!urlRes.rows[0]) return null
    const urlId: number = urlRes.rows[0].id
    const primaryCode: string = urlRes.rows[0].short_code

    const [aliasRes, bucketRes, countryRes] = await Promise.all([
      this.pool.query(
        "SELECT id, alias_code FROM url_aliases WHERE url_id = $1 ORDER BY created_at",
        [urlId]
      ),
      this.pool.query(
        `SELECT alias_id, bucket_type, bucket_start, clicks_count, unique_estimated_count
         FROM click_analytics_buckets WHERE url_id = $1`,
        [urlId]
      ),
      this.pool.query(
        `SELECT alias_id, country_code, SUM(clicks_count)::int AS clicks
         FROM click_country_analytics WHERE url_id = $1
         GROUP BY alias_id, country_code`,
        [urlId]
      ),
    ])

    const buckets = bucketRes.rows as BucketRow[]
    const countries = countryRes.rows as CountryRow[]

    const scopeDefs: { key: string; aliasId: number; label: string }[] = [
      { key: "link", aliasId: LINK_SCOPE, label: "All routes" },
      { key: "primary", aliasId: PRIMARY_SCOPE, label: `/${primaryCode}` },
      ...aliasRes.rows.map((r: { id: number; alias_code: string }) => ({
        key: r.alias_code,
        aliasId: r.id,
        label: `/${r.alias_code}`,
      })),
    ]

    const todayStr = utcDateString(now)
    // Windows keep the payload small; charts only need recent history.
    const hourFloor = now.getTime() - 48 * 3_600_000
    const dayFloor = now.getTime() - 90 * 86_400_000

    const scopes = scopeDefs.map((def) => {
      const mine = buckets.filter((b) => b.alias_id === def.aliasId)
      const series = (type: string, floor: number) =>
        mine
          .filter((b) => b.bucket_type === type)
          .map((b) => ({
            bucketStart: new Date(b.bucket_start),
            clicks: b.clicks_count,
            unique: b.unique_estimated_count,
          }))
          .filter((p) => p.bucketStart.getTime() >= floor)
          .sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime())

      const daySeries = mine.filter((b) => b.bucket_type === "day")
      const totalClicks = daySeries.reduce((s, b) => s + b.clicks_count, 0)
      const uniqueToday =
        daySeries.find(
          (b) => utcDateString(new Date(b.bucket_start)) === todayStr
        )?.unique_estimated_count ?? 0

      return {
        key: def.key,
        aliasId: def.aliasId,
        label: def.label,
        totalClicks,
        uniqueToday,
        hourly: series("hour", hourFloor),
        daily: series("day", dayFloor),
        monthly: series("month", -Infinity),
        countries: countries
          .filter((c) => c.alias_id === def.aliasId)
          .map((c) => ({ countryCode: c.country_code, clicks: c.clicks }))
          .sort((a, b) => b.clicks - a.clicks),
      }
    })

    return AnalyticsResult.parse({ shortCode, generatedAt: now, scopes })
  }
}

export const analyticsService = new AnalyticsService()

// Periodically purge expired deduplication rows. Guarded like db init so it
// never runs during builds. `unref` keeps it from holding the process open.
if (!process.env.SKIP_ENV_VALIDATION) {
  const timer = setInterval(() => {
    analyticsService
      .purgeExpiredDedup()
      .catch(() => console.error("Analytics dedup purge failed"))
  }, PURGE_INTERVAL_MS)
  timer.unref?.()
}
