"use client"

import { SiGithub as Github } from "@icons-pack/react-simple-icons"
import {
  FileCodeCorner,
  LogOut,
  Plus,
  Search,
  Star,
  Tag,
  X,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useDebounce } from "use-debounce"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { env } from "@/env"
import { useAllTags, useUrls } from "@/hooks/urls"
import type { UrlRecord, UrlsQueryParams } from "@/lib/schemas"
import { copyToClipboard, getTagColor, makeShortUrl } from "@/lib/utils"
import { AliasStatsDialog } from "./alias-stats-dialog"
import { AnalyticsDialog } from "./analytics-dialog"
import { CreateUrlDialog } from "./create-url-dialog"
import { type EditDialogState, EditUrlDialog } from "./edit-url-dialog"
import { PaginationControls } from "./pagination"
import { QrCodeDialog } from "./qr-code-dialog"
import { Toggle } from "./ui/toggle"
import { MobileRow, UrlRecordRow } from "./url-record-row"

export function Dashboard() {
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch] = useDebounce(searchInput, 300)
  const [qp, setQueryParams] = useState<UrlsQueryParams>({
    page: 1,
    limit: 10,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  // Merge debounced search with query params
  const queryParams: UrlsQueryParams = {
    ...qp,
    search: debouncedSearch || undefined,
  }

  const { urls, pagination, loading, refetch } = useUrls(queryParams)
  const { tags: allTags, refetch: refetchTags } = useAllTags()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialog, setEditDialog] = useState<EditDialogState>({ open: false })
  const [aliasStatsDialog, setAliasStatsDialog] = useState<{
    open: boolean
    url?: UrlRecord
  }>({ open: false })
  const [analyticsDialog, setAnalyticsDialog] = useState<{
    open: boolean
    url?: UrlRecord
  }>({ open: false })
  const [qrDialog, setQrDialog] = useState<{
    open: boolean
    url?: UrlRecord
    aliasCode?: string
  }>({ open: false })

  const handleStarredToggle = () => {
    setQueryParams((prev) => ({
      ...prev,
      customOnly: !prev.customOnly,
      page: 1,
    }))
  }

  const handleTagFilter = (tag: string) => {
    setQueryParams((prev) => ({
      ...prev,
      tag: tag === "__all__" ? undefined : tag,
      page: 1,
    }))
  }

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split("-") as [
      UrlsQueryParams["sortBy"],
      UrlsQueryParams["sortOrder"],
    ]
    setQueryParams((prev) => ({
      ...prev,
      sortBy,
      sortOrder,
    }))
  }

  const handlePageChange = (page: number) => {
    setQueryParams((prev) => ({ ...prev, page }))
  }
  const handleLimitChange = (limit: number) => {
    setQueryParams((prev) => ({ ...prev, limit, page: 1 }))
  }

  const handleDelete = async (shortCode: string) => {
    if (!confirm("Are you sure you want to delete this URL?")) return

    try {
      const response = await fetch(`/api/urls/${shortCode}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("URL deleted successfully")
        refetch()
      } else {
        toast.error("Failed to delete URL")
      }
    } catch (error) {
      console.error("Error deleting URL:", error)
      toast.error("Failed to delete URL")
    }
  }

  const handleAliasStats = useCallback((url: UrlRecord) => {
    setAliasStatsDialog({ open: true, url })
  }, [])

  const handleAnalytics = useCallback((url: UrlRecord) => {
    setAnalyticsDialog({ open: true, url })
  }, [])

  const handleToggleStar = useCallback(
    async (url: UrlRecord) => {
      try {
        const response = await fetch(`/api/urls/${url.short_code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_starred: !url.is_starred }),
        })
        if (response.ok) {
          refetch()
        } else {
          toast.error("Failed to update star")
        }
      } catch {
        toast.error("Failed to update star")
      }
    },
    [refetch]
  )

  const currentSort = `${qp.sortBy}-${qp.sortOrder}`
  const activeTag = qp.tag

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between gap-4 items-center max-md:flex-col">
        <div className="flex items-center gap-4">
          <Image
            src={logo}
            alt="PoliNetwork Logo"
            className="h-16 w-16 bg-white rounded-md p-2"
          />
          <div className="gap-2">
            <h1 className="text-3xl font-bold">{env.NEXT_PUBLIC_DOMAIN}</h1>
            <p className="text-muted-foreground max-md:text-sm">
              Gabriele Viganò URL shortener dashboard
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-4 max-md:gap-2 flex-wrap">
          <Button
            size="icon-lg"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/api/auth/signin" })}
            title="Logout"
          >
            <LogOut />
          </Button>
          <a
            href="https://github.com/viganogabriele/vigab.cc"
            className="underline flex items-center gap-1"
            title="https://github.com/viganogabriele/vigab.cc"
            aria-label="vigab.cc github repository by Gabriele Viganò"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="icon-lg" variant="outline">
              <Github />
            </Button>
          </a>
          <Link href="/api" target="_blank" rel="noopener noreferral">
            <Button variant="outline" size="icon-lg" className="md:hidden">
              <FileCodeCorner />
            </Button>
            <Button size="lg" variant="outline" className="max-md:hidden">
              <FileCodeCorner />
              <span>API Docs</span>
            </Button>
          </Link>
          <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
            <Plus />
            <span>Create Short URL</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your URLs</CardTitle>
          <CardDescription>
            All your shortened URLs and their statistics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 items-center max-md:flex-col">
            <div className="relative flex-1 max-md:w-full max-md:order-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search URLs or short codes..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-4 items-center justify-between max-md:w-full max-md:order-3 flex-wrap">
              <Select value={currentSort} onValueChange={handleSortChange}>
                <SelectTrigger className="w-[170px] flex-100">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Newest First</SelectItem>
                  <SelectItem value="created_at-asc">Oldest First</SelectItem>
                  <SelectItem value="updated_at-desc">
                    Recently Updated
                  </SelectItem>
                  <SelectItem value="click_count-desc">Most Clicks</SelectItem>
                  <SelectItem value="click_count-asc">Least Clicks</SelectItem>
                  <SelectItem value="short_code-asc">Short Code A-Z</SelectItem>
                  <SelectItem value="short_code-desc">
                    Short Code Z-A
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Tag filter */}
              {allTags.length > 0 && (
                <div className="flex items-center gap-1">
                  <Select
                    value={activeTag ?? "__all__"}
                    onValueChange={handleTagFilter}
                  >
                    <SelectTrigger className="w-[160px] flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                      {activeTag ? (
                        (() => {
                          const c = getTagColor(activeTag)
                          return (
                            <span
                              style={{
                                backgroundColor: c.bg,
                                color: c.text,
                                border: `1px solid ${c.border}`,
                              }}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium truncate"
                            >
                              {activeTag}
                            </span>
                          )
                        })()
                      ) : (
                        <SelectValue placeholder="All tags" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All tags</SelectItem>
                      {allTags.map((tag) => {
                        const color = getTagColor(tag)
                        return (
                          <SelectItem key={tag} value={tag}>
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: color.text }}
                              />
                              {tag}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {activeTag && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleTagFilter("__all__")}
                      title="Clear tag filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}

              <Toggle
                pressed={queryParams.customOnly}
                onPressedChange={handleStarredToggle}
                variant="outline"
                className="data-[state=on]:*:[svg]:fill-yellow-300 data-[state=on]:*:[svg]:stroke-yellow-300 flex-[1_0_auto]"
              >
                <Star className="h-4 w-4" />
                Starred Only
              </Toggle>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-6">Loading...</div>
          ) : urls.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              {searchInput
                ? "No URLs found matching your search."
                : "No URLs found. Create your first short URL to get started."}
            </div>
          ) : (
            <>
              <div className="lg:hidden flex flex-col gap-4">
                {urls.map((url: UrlRecord) => (
                  <MobileRow
                    key={url.id}
                    url={url}
                    onCopy={(url) => copyToClipboard(makeShortUrl(url))}
                    onDelete={(url) => handleDelete(url.short_code)}
                    onEdit={(url) => setEditDialog({ open: true, url })}
                    onQrCode={(url) =>
                      setQrDialog({ open: true, url, aliasCode: undefined })
                    }
                    onToggleStar={handleToggleStar}
                    onAliasStats={handleAliasStats}
                    onAnalytics={handleAnalytics}
                  />
                ))}
              </div>
              <Table className="max-lg:hidden">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-4">
                      <Star className="h-4 w-4" />
                    </TableHead>
                    <TableHead>Short URL</TableHead>
                    <TableHead>Original URL</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-0 text-center">Clicks</TableHead>
                    <TableHead className="w-0 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urls.map((url: UrlRecord) => (
                    <UrlRecordRow
                      key={url.id}
                      url={url}
                      onCopy={(url) => copyToClipboard(makeShortUrl(url))}
                      onDelete={(url) => handleDelete(url.short_code)}
                      onEdit={(url) => setEditDialog({ open: true, url })}
                      onQrCode={(url) =>
                        setQrDialog({ open: true, url, aliasCode: undefined })
                      }
                      onToggleStar={handleToggleStar}
                      onAliasStats={handleAliasStats}
                      onAnalytics={handleAnalytics}
                    />
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && (
                <PaginationControls
                  {...pagination}
                  onPageChange={handlePageChange}
                  onLimitChange={handleLimitChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CreateUrlDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          refetch()
          refetchTags()
          setCreateDialogOpen(false)
        }}
      />

      <EditUrlDialog
        {...editDialog}
        onClose={() => setEditDialog({ open: false })}
        onSuccess={() => {
          refetch()
          refetchTags()
          setEditDialog({ open: false })
        }}
      />

      <AliasStatsDialog
        open={aliasStatsDialog.open}
        url={aliasStatsDialog.url}
        onClose={() => setAliasStatsDialog({ open: false })}
        onManageAliases={(url) => {
          setAliasStatsDialog({ open: false })
          setEditDialog({ open: true, url })
        }}
        onQrCode={(url, aliasCode) => {
          setAliasStatsDialog({ open: false })
          setQrDialog({ open: true, url, aliasCode })
        }}
      />

      <AnalyticsDialog
        open={analyticsDialog.open}
        url={analyticsDialog.url}
        onClose={() => setAnalyticsDialog({ open: false })}
      />

      <QrCodeDialog
        open={qrDialog.open}
        url={qrDialog.url}
        aliasCode={qrDialog.aliasCode}
        onOpenChange={(open) =>
          setQrDialog((prev) => ({
            ...prev,
            open,
            aliasCode: open ? prev.aliasCode : undefined,
          }))
        }
      />
    </div>
  )
}
