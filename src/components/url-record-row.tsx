import {
  ArrowRight,
  ChartColumn,
  Copy,
  Edit,
  GitBranch,
  Pointer,
  QrCode,
  Star,
  Trash2,
} from "lucide-react"
import type { UrlRecord } from "@/lib/schemas"
import {
  copyToClipboard,
  getTagColor,
  makeShortUrl,
  relativeTime,
} from "@/lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { TableCell, TableRow } from "./ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

export type UrlRecordRowProps = {
  url: UrlRecord
  onCopy: (url: UrlRecord) => void
  onDelete: (url: UrlRecord) => void
  onEdit: (url: UrlRecord) => void
  onQrCode: (url: UrlRecord) => void
  onToggleStar: (url: UrlRecord) => void
  onAliasStats: (url: UrlRecord) => void
  onAnalytics: (url: UrlRecord) => void
}

function TagBadges({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <>
      {tags.map((tag) => {
        const c = getTagColor(tag)
        return (
          <Tooltip key={tag}>
            <TooltipTrigger asChild>
              <span
                style={{
                  backgroundColor: c.bg,
                  color: c.text,
                  border: `1px solid ${c.border}`,
                }}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium max-w-[9rem] truncate cursor-default select-none transition-opacity hover:opacity-80"
              >
                {tag}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{tag}</TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}

function StarButton({
  starred,
  onClick,
}: {
  starred: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
      aria-label={starred ? "Unstar URL" : "Star URL"}
      title={starred ? "Remove from starred" : "Mark as starred"}
    >
      <Star
        className="h-4 w-4"
        style={
          starred
            ? { fill: "#facc15", stroke: "#ca8a04" }
            : { fill: "transparent", stroke: "currentColor", opacity: 0.4 }
        }
      />
    </button>
  )
}

export function MobileRow({
  url,
  onCopy,
  onDelete,
  onEdit,
  onQrCode,
  onToggleStar,
  onAliasStats,
  onAnalytics,
}: UrlRecordRowProps) {
  const shortUrl = makeShortUrl(url)
  return (
    <div className="flex flex-col gap-1 border rounded-md py-2 px-4">
      <div className="flex justify-start gap-2 items-center">
        <StarButton
          starred={url.is_starred}
          onClick={() => onToggleStar(url)}
        />
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 flex-1 hover:underline font-mono"
        >
          <span className="max-sm:hidden">{shortUrl}</span>
          <span className="sm:hidden">/{url.short_code}</span>
        </a>
        {url.aliases && url.aliases.length > 0 && (
          <Badge
            variant="outline"
            asChild
            className="gap-1 cursor-pointer hover:bg-accent transition-colors"
          >
            <button
              type="button"
              onClick={() => onAliasStats(url)}
              title={`+${url.aliases.length} aliases — ${url.click_count} total clicks`}
            >
              <GitBranch className="h-3 w-3" />
              {url.aliases.length}
            </button>
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={() => onCopy(url)}>
          <Copy />
        </Button>
      </div>
      {url.tags && url.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-6">
          <TagBadges tags={url.tags} />
        </div>
      )}
      <div className="flex justify-start gap-2 items-center">
        <ArrowRight className="text-blue-400" />
        <a
          href={url.original_url}
          className="text-blue-400 flex-1 hover:underline font-mono truncate"
          title={url.original_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {url.original_url}
        </a>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => copyToClipboard(url.original_url)}
        >
          <Copy />
        </Button>
      </div>
      <div className="flex justify-end gap-2 items-center py-1 flex-wrap">
        <Pointer className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm">{url.click_count}</span>
        {url.last_clicked_at && (
          <span className="text-xs text-muted-foreground opacity-70">
            · {relativeTime(url.last_clicked_at)}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {url.created_at.toLocaleString()}
        </span>
        <div className="flex justify-end items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onAnalytics(url)}
            title="View analytics"
          >
            <ChartColumn />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onQrCode(url)}>
            <QrCode />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(url)}>
            <Edit />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(url)}>
            <Trash2 className="stroke-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function UrlRecordRow({ url, ...props }: UrlRecordRowProps) {
  const shortUrl = makeShortUrl(url)
  return (
    <TableRow key={url.id}>
      <TableCell>
        <StarButton
          starred={url.is_starred}
          onClick={() => props.onToggleStar(url)}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline font-mono"
          >
            {shortUrl}
          </a>
          {url.aliases && url.aliases.length > 0 && (
            <Badge
              variant="outline"
              asChild
              className="gap-1 cursor-pointer hover:bg-accent transition-colors"
            >
              <button
                type="button"
                onClick={() => props.onAliasStats(url)}
                title={`+${url.aliases.length} aliases — ${url.click_count} total clicks`}
              >
                <GitBranch className="h-3 w-3" />
                {url.aliases.length}
              </button>
            </Badge>
          )}
          <TagBadges tags={url.tags ?? []} />
          <Button variant="ghost" size="icon" onClick={() => props.onCopy(url)}>
            <Copy />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <a
            href={url.original_url}
            className="text-blue-400 hover:underline font-mono truncate max-w-[20vw] xl:max-w-[500px]"
            title={url.original_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url.original_url}
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copyToClipboard(url.original_url)}
          >
            <Copy />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {url.created_at.toLocaleString()}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-medium cursor-default">
              {url.click_count}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Last click: {relativeTime(url.last_clicked_at)}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => props.onAnalytics(url)}
            title="View analytics"
          >
            <ChartColumn />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => props.onQrCode(url)}
          >
            <QrCode />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => props.onEdit(url)}>
            <Edit />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => props.onDelete(url)}
          >
            <Trash2 className="stroke-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
