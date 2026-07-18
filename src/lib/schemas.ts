import { z } from "zod"

export const URLRecord = z.object({
  id: z.coerce.number(),
  is_custom: z.boolean(),
  is_starred: z.boolean().default(false),
  tags: z.array(z.string()).optional().default([]),
  original_url: z.string().url(),
  short_code: z.string().max(25),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  click_count: z.number().int().nonnegative(),
  last_clicked_at: z.coerce.date().nullable().optional().default(null),
  aliases: z.array(z.string()).optional().default([]),
})
export const URLRecords = z.array(URLRecord)

export const AliasRecord = z.object({
  id: z.coerce.number(),
  url_id: z.coerce.number(),
  alias_code: z.string().max(25),
  created_at: z.coerce.date(),
})
export const AliasRecords = z.array(AliasRecord)

export const AliasStatsRow = z.object({
  alias_code: z.string().max(25),
  click_count: z.number().int().nonnegative(),
  last_clicked_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
})

export const AliasStatsResult = z.object({
  urlClickCount: z.number().int().nonnegative(),
  urlLastClickedAt: z.coerce.date().nullable(),
  aliases: z.array(AliasStatsRow),
})

export type UrlRecord = z.infer<typeof URLRecord>
export type UrlRecords = z.infer<typeof URLRecords>
export type AliasRecord = z.infer<typeof AliasRecord>
export type AliasRecords = z.infer<typeof AliasRecords>
export type AliasStatsRow = z.infer<typeof AliasStatsRow>
export type AliasStatsResult = z.infer<typeof AliasStatsResult>

// ── Analytics (privacy-preserving, aggregated) ───────────────────────────────

export const AnalyticsBucketPoint = z.object({
  bucketStart: z.coerce.date(),
  clicks: z.number().int().nonnegative(),
  unique: z.number().int().nonnegative(),
})

export const AnalyticsCountryPoint = z.object({
  countryCode: z.string(),
  clicks: z.number().int().nonnegative(),
})

export const AnalyticsScope = z.object({
  // "link" (whole link), "primary" (short_code route), or an alias code
  key: z.string(),
  // -1 = link, 0 = primary short_code, >0 = url_aliases.id
  aliasId: z.number().int(),
  label: z.string(),
  totalClicks: z.number().int().nonnegative(),
  uniqueToday: z.number().int().nonnegative(),
  hourly: z.array(AnalyticsBucketPoint),
  daily: z.array(AnalyticsBucketPoint),
  monthly: z.array(AnalyticsBucketPoint),
  countries: z.array(AnalyticsCountryPoint),
})

export const AnalyticsResult = z.object({
  shortCode: z.string(),
  generatedAt: z.coerce.date(),
  scopes: z.array(AnalyticsScope),
})

export type AnalyticsBucketPoint = z.infer<typeof AnalyticsBucketPoint>
export type AnalyticsCountryPoint = z.infer<typeof AnalyticsCountryPoint>
export type AnalyticsScope = z.infer<typeof AnalyticsScope>
export type AnalyticsResult = z.infer<typeof AnalyticsResult>

export const PaginatedUrlsResponse = z.object({
  urls: z.array(URLRecord),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
})

export const GetUrlsQueryParams = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  search: z.string().optional(),
  sortBy: z
    .enum(["created_at", "updated_at", "click_count", "short_code"])
    .optional()
    .default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  // filters by is_starred
  customOnly: z.coerce.boolean().optional().default(false),
  // filter by a single tag name (URL appears if it owns that tag)
  tag: z.string().optional(),
})

export type PaginatedUrlsResponse = z.infer<typeof PaginatedUrlsResponse>
export type GetUrlsQueryParams = z.infer<typeof GetUrlsQueryParams>
export type UrlsQueryParams = Partial<GetUrlsQueryParams>
