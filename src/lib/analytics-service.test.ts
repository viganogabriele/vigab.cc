import type { Pool } from "pg"
import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"
import { ANALYTICS_SCHEMA_SQL } from "./analytics-schema"
import {
  AnalyticsService,
  computeDailyVisitorHash,
  LINK_SCOPE,
  PRIMARY_SCOPE,
} from "./analytics-service"
import type { AnalyticsResult } from "./schemas"

/** Find a scope by its alias_id, failing loudly if it's missing. */
function scopeOf(result: AnalyticsResult | null, aliasId: number) {
  const s = result?.scopes.find((x) => x.aliasId === aliasId)
  if (!s) throw new Error(`scope ${aliasId} not found`)
  return s
}

const SECRET = "test-analytics-secret-abcdefzz"
const RAW_IP = "203.0.113.7"
const RAW_UA = "Mozilla/5.0 (SecretDevice; rv:1.0) Gecko/20100101 Firefox/1.0"

// Minimal slice of the real schema needed for analytics (urls + url_aliases),
// then the shared analytics DDL.
const BASE_SCHEMA = `
  CREATE TABLE urls (
    id SERIAL PRIMARY KEY,
    short_code VARCHAR(25) UNIQUE NOT NULL,
    original_url TEXT NOT NULL
  );
  CREATE TABLE url_aliases (
    id SERIAL PRIMARY KEY,
    url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    alias_code VARCHAR(25) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`

async function setup() {
  const mem = newDb()
  const pg = mem.adapters.createPg()
  const pool = new pg.Pool() as unknown as Pool
  await pool.query(BASE_SCHEMA)
  await pool.query(ANALYTICS_SCHEMA_SQL)

  const url = await pool.query(
    "INSERT INTO urls (short_code, original_url) VALUES ($1, $2) RETURNING id",
    ["abc", "https://example.com"]
  )
  const urlId: number = url.rows[0].id
  const alias = await pool.query(
    "INSERT INTO url_aliases (url_id, alias_code) VALUES ($1, $2) RETURNING id",
    [urlId, "myalias"]
  )
  const aliasId: number = alias.rows[0].id

  const service = new AnalyticsService({ pool, secret: SECRET })
  return { mem, pool, service, urlId, aliasId }
}

const D1 = new Date("2026-07-18T10:30:00Z")
const D1_LATER = new Date("2026-07-18T22:00:00Z")
const D2 = new Date("2026-07-19T09:00:00Z")

describe("computeDailyVisitorHash", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:0",
      dateStr: "2026-07-18",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    const b = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:0",
      dateStr: "2026-07-18",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it("rotates across days (no cross-day tracking)", () => {
    const day1 = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:0",
      dateStr: "2026-07-18",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    const day2 = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:0",
      dateStr: "2026-07-19",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    expect(day1).not.toBe(day2)
  })

  it("differs per scope (reduced cross-link linkability)", () => {
    const link = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:link",
      dateStr: "2026-07-18",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    const route = computeDailyVisitorHash(SECRET, {
      scopeToken: "1:0",
      dateStr: "2026-07-18",
      ip: RAW_IP,
      userAgent: RAW_UA,
    })
    expect(link).not.toBe(route)
  })
})

describe("AnalyticsService.recordClick", () => {
  let ctx: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => {
    ctx = await setup()
  })

  it("increments total click counts per link and per route", async () => {
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: D1,
    })
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: "198.51.100.2",
      userAgent: "another-ua",
      country: "US",
      at: D1_LATER,
    })

    const result = await ctx.service.getAnalytics("abc", D1_LATER)
    expect(result).not.toBeNull()
    const link = scopeOf(result, LINK_SCOPE)
    const primary = scopeOf(result, PRIMARY_SCOPE)
    expect(link.totalClicks).toBe(2)
    expect(primary.totalClicks).toBe(2)
  })

  it("aggregates clicks by country", async () => {
    for (const country of ["US", "US", "FR"]) {
      await ctx.service.recordClick({
        urlId: ctx.urlId,
        aliasId: PRIMARY_SCOPE,
        ip: `ip-${Math.random()}`,
        userAgent: `ua-${Math.random()}`,
        country,
        at: D1,
      })
    }
    const result = await ctx.service.getAnalytics("abc", D1)
    const link = scopeOf(result, LINK_SCOPE)
    const byCode = Object.fromEntries(
      link.countries.map((c) => [c.countryCode, c.clicks])
    )
    expect(byCode.US).toBe(2)
    expect(byCode.FR).toBe(1)
  })

  it("stores 'Unknown' when the country is missing", async () => {
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "",
      at: D1,
    })
    const result = await ctx.service.getAnalytics("abc", D1)
    const link = scopeOf(result, LINK_SCOPE)
    expect(link.countries[0].countryCode).toBe("Unknown")
  })

  it("counts the same visitor once on the same day", async () => {
    for (let i = 0; i < 3; i++) {
      await ctx.service.recordClick({
        urlId: ctx.urlId,
        aliasId: PRIMARY_SCOPE,
        ip: RAW_IP,
        userAgent: RAW_UA,
        country: "US",
        at: D1,
      })
    }
    const result = await ctx.service.getAnalytics("abc", D1)
    const primary = scopeOf(result, PRIMARY_SCOPE)
    expect(primary.totalClicks).toBe(3)
    expect(primary.uniqueToday).toBe(1) // deduped within the day
  })

  it("counts the same visitor again on a different day", async () => {
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: D1,
    })
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: D2,
    })

    const day1 = await ctx.service.getAnalytics("abc", D1)
    const day2 = await ctx.service.getAnalytics("abc", D2)
    expect(scopeOf(day1, PRIMARY_SCOPE).uniqueToday).toBe(1)
    expect(scopeOf(day2, PRIMARY_SCOPE).uniqueToday).toBe(1)
  })

  it("tracks an alias hit under its own scope", async () => {
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: ctx.aliasId,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: D1,
    })
    const result = await ctx.service.getAnalytics("abc", D1)
    const alias = scopeOf(result, ctx.aliasId)
    const link = scopeOf(result, LINK_SCOPE)
    const primary = scopeOf(result, PRIMARY_SCOPE)
    expect(alias.totalClicks).toBe(1)
    expect(link.totalClicks).toBe(1) // link total includes alias hits
    expect(primary.totalClicks).toBe(0) // but not attributed to primary route
  })

  it("never persists the raw IP or User-Agent in any analytics table", async () => {
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: D1,
    })

    const dump = await Promise.all([
      ctx.pool.query("SELECT * FROM click_analytics_buckets"),
      ctx.pool.query("SELECT * FROM click_country_analytics"),
      ctx.pool.query("SELECT * FROM daily_unique_click_dedup"),
    ])
    const serialized = JSON.stringify(dump.map((d) => d.rows))
    expect(serialized).not.toContain(RAW_IP)
    expect(serialized).not.toContain(RAW_UA)

    // The only visitor-derived value stored is a 64-char hex hash.
    const dedup = dump[2].rows
    expect(dedup.length).toBeGreaterThan(0)
    for (const row of dedup) {
      expect(row.daily_visitor_hash).toMatch(/^[a-f0-9]{64}$/)
      expect(row.daily_visitor_hash).not.toContain(RAW_IP)
    }
  })
})

describe("AnalyticsService.purgeExpiredDedup", () => {
  it("removes dedup rows older than the retention window", async () => {
    const ctx = await setup()
    await ctx.service.recordClick({
      urlId: ctx.urlId,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
      at: new Date("2026-07-01T10:00:00Z"),
    })
    const before = await ctx.pool.query(
      "SELECT COUNT(*)::int AS n FROM daily_unique_click_dedup"
    )
    expect(before.rows[0].n).toBeGreaterThan(0)

    const deleted = await ctx.service.purgeExpiredDedup({ at: D2 })
    expect(deleted).toBeGreaterThan(0)
    const after = await ctx.pool.query(
      "SELECT COUNT(*)::int AS n FROM daily_unique_click_dedup"
    )
    expect(after.rows[0].n).toBe(0)
  })
})

describe("AnalyticsService.recordClickSafely", () => {
  it("does not throw (does not block redirects) when the write fails", async () => {
    const failingPool = {
      connect: async () => {
        throw new Error("db down")
      },
      query: async () => {
        throw new Error("db down")
      },
    } as unknown as Pool
    const service = new AnalyticsService({ pool: failingPool, secret: SECRET })

    const ok = await service.recordClickSafely({
      urlId: 1,
      aliasId: PRIMARY_SCOPE,
      ip: RAW_IP,
      userAgent: RAW_UA,
      country: "US",
    })
    expect(ok).toBe(false)
  })
})
