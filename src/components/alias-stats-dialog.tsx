"use client"

import { GitBranch, Pointer, QrCode } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getAliasStatsDirect } from "@/lib/actions"
import type { UrlRecord } from "@/lib/schemas"
import { makeAliasUrl, makeShortUrl, relativeTime } from "@/lib/utils"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

type AliasStats = {
  alias_code: string
  click_count: number
  last_clicked_at: Date | null
  created_at: Date
}

interface AliasStatsDialogProps {
  open: boolean
  url?: UrlRecord
  onClose: () => void
  onManageAliases: (url: UrlRecord) => void
  onQrCode: (url: UrlRecord, aliasCode: string) => void
}


function ClickRow({
  label,
  href,
  clicks,
  lastClicked,
  onQr,
  isPrimary,
}: {
  label: string
  href: string
  clicks: number
  lastClicked: Date | null | undefined
  onQr: () => void
  isPrimary?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group">
      <div className="flex flex-col flex-1 min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-blue-400 hover:underline truncate"
        >
          {label}
        </a>
        <span className="text-xs text-muted-foreground opacity-70">
          last click: {relativeTime(lastClicked)}
        </span>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium tabular-nums shrink-0">
        <Pointer className="h-3 w-3 text-muted-foreground" />
        {clicks}
      </span>
      {!isPrimary && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onQr}
          title={`QR code for ${label}`}
        >
          <QrCode className="h-4 w-4" />
        </Button>
      )}
      {isPrimary && <div className="h-7 w-7 shrink-0" />}
    </div>
  )
}

export function AliasStatsDialog({
  open,
  url,
  onClose,
  onManageAliases,
  onQrCode,
}: AliasStatsDialogProps) {
  const [stats, setStats] = useState<AliasStats[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !url) return
    setLoading(true)
    setStats(null)
    getAliasStatsDirect(url.id)
      .then((rows) =>
        setStats(
          rows.map((r) => ({
            ...r,
            last_clicked_at: r.last_clicked_at ? new Date(r.last_clicked_at) : null,
            created_at: new Date(r.created_at),
          }))
        )
      )
      .catch(() => toast.error("Failed to load alias stats"))
      .finally(() => setLoading(false))
  }, [open, url?.id])

  if (!url) return null

  const aliasClickTotal = stats?.reduce((s, r) => s + r.click_count, 0) ?? 0
  const primaryClicks = url.click_count - aliasClickTotal

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            /{url.short_code}
          </DialogTitle>
          <DialogDescription className="text-xs break-all">
            {makeShortUrl(url)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Aggregate */}
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Total clicks</span>
            <span className="flex items-center gap-1.5 text-xl font-semibold tabular-nums">
              <Pointer className="h-4 w-4 text-muted-foreground" />
              {url.click_count}
            </span>
          </div>

          {/* Per-route breakdown */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-3">Loading…</p>
          ) : stats !== null ? (
            <div className="flex flex-col rounded-md border overflow-hidden divide-y">
              {/* Primary route */}
              <ClickRow
                label={`/${url.short_code}`}
                href={makeShortUrl(url)}
                clicks={primaryClicks >= 0 ? primaryClicks : 0}
                lastClicked={url.last_clicked_at}
                onQr={() => {}}
                isPrimary
              />
              {/* Alias rows */}
              {stats.map((s) => (
                <ClickRow
                  key={s.alias_code}
                  label={`/${s.alias_code}`}
                  href={makeAliasUrl(s.alias_code)}
                  clicks={s.click_count}
                  lastClicked={s.last_clicked_at}
                  onQr={() => onQrCode(url, s.alias_code)}
                />
              ))}
              {stats.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No aliases
                </p>
              )}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground opacity-60">
            Per-route click counts reflect visits since tracking was enabled.
            Primary = total − alias clicks.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onManageAliases(url)}>
            Manage aliases
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
