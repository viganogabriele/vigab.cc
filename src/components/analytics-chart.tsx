"use client"

import type { AnalyticsBucketPoint } from "@/lib/schemas"

type BucketType = "hour" | "day" | "month"

// All bucket_start values are UTC-truncated, so format them in UTC to match.
function labelFor(date: Date, type: BucketType): string {
  const opts: Intl.DateTimeFormatOptions =
    type === "hour"
      ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }
      : type === "day"
        ? { month: "short", day: "numeric", timeZone: "UTC" }
        : { month: "short", year: "numeric", timeZone: "UTC" }
  return new Intl.DateTimeFormat(undefined, opts).format(date)
}

function fullLabelFor(date: Date, type: BucketType): string {
  const opts: Intl.DateTimeFormatOptions =
    type === "month"
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : {
          dateStyle: "medium",
          ...(type === "hour" ? { timeStyle: "short" } : {}),
          timeZone: "UTC",
        }
  return new Intl.DateTimeFormat(undefined, opts).format(date)
}

/**
 * Pad a sparse series with zero-count buckets so the chart shows an even,
 * continuous timeline instead of only the buckets that happened to get clicks.
 */
function densify(
  points: AnalyticsBucketPoint[],
  type: BucketType,
  now: Date
): AnalyticsBucketPoint[] {
  if (type === "month") return points // months are already few; show as-is
  const byTime = new Map(points.map((p) => [p.bucketStart.getTime(), p]))
  const count = type === "hour" ? 24 : 14
  const stepMs = type === "hour" ? 3_600_000 : 86_400_000
  const end =
    type === "hour"
      ? Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours()
        )
      : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const out: AnalyticsBucketPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    const t = end - i * stepMs
    const existing = byTime.get(t)
    out.push(existing ?? { bucketStart: new Date(t), clicks: 0, unique: 0 })
  }
  return out
}

export function BarChart({
  points,
  type,
  now = new Date(),
}: {
  points: AnalyticsBucketPoint[]
  type: BucketType
  now?: Date
}) {
  const data = densify(points, type, now)
  const max = Math.max(1, ...data.map((p) => p.clicks))
  const hasClicks = data.some((p) => p.clicks > 0)

  if (data.length === 0 || !hasClicks) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No clicks in this window yet.
      </p>
    )
  }

  // Show at most ~12 x-axis labels to avoid crowding.
  const labelEvery = Math.ceil(data.length / 12)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-[3px] h-40" aria-hidden={false}>
        {data.map((p) => {
          const heightPct = (p.clicks / max) * 100
          return (
            <div
              key={p.bucketStart.getTime()}
              className="flex-1 flex flex-col justify-end items-center h-full group"
              title={`${fullLabelFor(p.bucketStart, type)} — ${p.clicks} clicks, ${p.unique} unique`}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {p.clicks}
              </span>
              <div
                className="w-full rounded-sm bg-blue-500/80 hover:bg-blue-400 transition-colors min-h-[2px]"
                style={{
                  height: `${Math.max(heightPct, p.clicks > 0 ? 4 : 0)}%`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px]">
        {data.map((p, i) => (
          <div
            key={p.bucketStart.getTime()}
            className="flex-1 text-center text-[9px] text-muted-foreground truncate"
          >
            {i % labelEvery === 0 ? labelFor(p.bucketStart, type) : ""}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tiny inline sparkline for compact summaries (recent daily trend). */
export function Sparkline({ points }: { points: AnalyticsBucketPoint[] }) {
  const data = points.slice(-14)
  const max = Math.max(1, ...data.map((p) => p.clicks))
  if (data.length === 0) {
    return <span className="text-xs text-muted-foreground">no trend yet</span>
  }
  return (
    <div className="flex items-end gap-[2px] h-6" title="Recent daily clicks">
      {data.map((p) => (
        <div
          key={p.bucketStart.getTime()}
          className="w-1 rounded-sm bg-blue-500/70 min-h-[1px]"
          style={{
            height: `${Math.max((p.clicks / max) * 100, p.clicks > 0 ? 12 : 4)}%`,
          }}
        />
      ))}
    </div>
  )
}

/** ISO alpha-2 → display name; falls back to the raw value (e.g. "Unknown"). */
export function countryName(code: string): string {
  if (code === "Unknown") return "Unknown"
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "region" })
    return dn.of(code) ?? code
  } catch {
    return code
  }
}
