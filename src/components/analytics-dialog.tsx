"use client"

import { ChartColumn, Globe, Pointer, Users } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useAnalytics } from "@/hooks/urls"
import type { AnalyticsScope, UrlRecord } from "@/lib/schemas"
import { BarChart, countryName, Sparkline } from "./analytics-chart"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"

interface AnalyticsDialogProps {
  open: boolean
  url?: UrlRecord
  onClose: () => void
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function CountryTable({ scope }: { scope: AnalyticsScope }) {
  if (scope.countries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No country data yet.
      </p>
    )
  }
  const total = scope.countries.reduce((s, c) => s + c.clicks, 0)
  return (
    <div className="flex flex-col divide-y rounded-md border overflow-hidden">
      {scope.countries.slice(0, 12).map((c) => {
        const pct = total > 0 ? Math.round((c.clicks / total) * 100) : 0
        return (
          <div
            key={c.countryCode}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="flex-1 truncate">
              {countryName(c.countryCode)}
            </span>
            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500/80"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {c.clicks}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AnalyticsDialog({ open, url, onClose }: AnalyticsDialogProps) {
  const { analytics, loading, error } = useAnalytics(url?.short_code, open)
  const [scopeKey, setScopeKey] = useState("link")

  // Reset the scope selector each time a different URL's dialog opens.
  useEffect(() => {
    if (open) setScopeKey("link")
  }, [open])

  useEffect(() => {
    if (error) toast.error("Failed to load analytics")
  }, [error])

  if (!url) return null

  const scopes = analytics?.scopes ?? []
  const scope = scopes.find((s) => s.key === scopeKey) ?? scopes[0]
  const topCountries = scope?.countries.slice(0, 3) ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <ChartColumn className="h-4 w-4 shrink-0 text-muted-foreground" />/
            {url.short_code}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Anonymous, aggregated click analytics. No cookies, no
            fingerprinting.{" "}
            <Link href="/privacy" target="_blank" className="underline">
              How this works
            </Link>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Loading analytics…
          </p>
        ) : !scope ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No analytics available yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Scope selector: whole link, primary route, or a specific alias */}
            {scopes.length > 1 && (
              <Select value={scope.key} onValueChange={setScopeKey}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                      {s.key === "link"
                        ? " · whole link"
                        : s.key === "primary"
                          ? " · primary"
                          : " · alias"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Compact summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SummaryTile
                icon={<Pointer className="h-3 w-3" />}
                label="Total clicks"
                value={scope.totalClicks}
              />
              <SummaryTile
                icon={<Users className="h-3 w-3" />}
                label="Unique today (est.)"
                value={scope.uniqueToday}
              />
              <SummaryTile
                icon={<Globe className="h-3 w-3" />}
                label="Top countries"
                value={
                  topCountries.length > 0 ? (
                    <span className="flex flex-wrap gap-1 text-sm font-medium">
                      {topCountries.map((c) => (
                        <span
                          key={c.countryCode}
                          className="rounded bg-muted px-1.5 py-0.5"
                          title={`${countryName(c.countryCode)}: ${c.clicks}`}
                        >
                          {countryName(c.countryCode)} {c.clicks}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )
                }
              />
            </div>

            {/* Recent trend */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Recent daily trend
              </span>
              <Sparkline points={scope.daily} />
            </div>

            {/* Time charts */}
            <Tabs defaultValue="day">
              <TabsList className="w-full">
                <TabsTrigger value="hour" className="flex-1">
                  By hour
                </TabsTrigger>
                <TabsTrigger value="day" className="flex-1">
                  By day
                </TabsTrigger>
                <TabsTrigger value="month" className="flex-1">
                  By month
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hour" className="pt-3">
                <BarChart points={scope.hourly} type="hour" />
              </TabsContent>
              <TabsContent value="day" className="pt-3">
                <BarChart points={scope.daily} type="day" />
              </TabsContent>
              <TabsContent value="month" className="pt-3">
                <BarChart points={scope.monthly} type="month" />
              </TabsContent>
            </Tabs>

            {/* Countries */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Clicks by country
              </span>
              <CountryTable scope={scope} />
            </div>

            <p className="text-xs text-muted-foreground opacity-70">
              Unique counts are same-day estimates derived from a rotating daily
              hash — approximate, never used for cross-day tracking. Country is
              approximate and geolocation may be unavailable ("Unknown").
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
