"use client"

import { Star, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addAliasDirect, addTag, removeAlias, removeTag } from "@/lib/actions"
import type { UrlRecord } from "@/lib/schemas"
import { getTagColor, makeShortUrl } from "@/lib/utils"
import { Badge } from "./ui/badge"

export type EditDialogState =
  | { open: false }
  | { open: true; url: UrlRecord }

type EditUrlDialogProps = EditDialogState & {
  onClose: () => void
  onSuccess: () => void
}

export function EditUrlDialog({ onClose, onSuccess, ...state }: EditUrlDialogProps) {
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  // ── Snapshots stored as state (React Compiler tracks these correctly) ───────
  const [snapTags, setSnapTags] = useState<string[]>([])
  const [snapStarred, setSnapStarred] = useState(false)
  const [snapAliases, setSnapAliases] = useState<string[]>([])
  const [snapUrl, setSnapUrl] = useState("")

  // ── Working copies — nothing sent to server until Save ─────────────────────
  const [localTags, setLocalTags] = useState<string[]>([])
  const [localStarred, setLocalStarred] = useState(false)
  const [localAliases, setLocalAliases] = useState<string[]>([])
  const [localUrl, setLocalUrl] = useState("")

  // ── Tag / alias inputs ──────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("")
  const [tagError, setTagError] = useState<string | null>(null)
  const [aliasInput, setAliasInput] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Reset whenever the dialog opens or a different URL is loaded ────────────
  const urlId = state.open ? state.url.id : 0
  useEffect(() => {
    if (!state.open) return

    const tags = state.url.tags ?? []
    const aliases = state.url.aliases ?? []
    const starred = state.url.is_starred
    const url = state.url.original_url

    setSnapTags(tags)
    setSnapStarred(starred)
    setSnapAliases(aliases)
    setSnapUrl(url)

    setLocalTags([...tags])
    setLocalStarred(starred)
    setLocalAliases([...aliases])
    setLocalUrl(url)

    setTagInput("")
    setTagError(null)
    setAliasInput("")
    setAliasError(null)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, urlId])

  // ── Tag helpers ─────────────────────────────────────────────────────────────
  const addLocalTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (t.length > 50) { setTagError("Max 50 characters"); return }
    if (localTags.includes(t)) { setTagError("Tag already in list"); return }
    setLocalTags((prev) => [...prev, t])
    setTagInput("")
    setTagError(null)
  }
  const removeLocalTag = (tag: string) =>
    setLocalTags((prev) => prev.filter((x) => x !== tag))

  // ── Alias helpers ───────────────────────────────────────────────────────────
  const addLocalAlias = () => {
    const a = aliasInput.trim()
    if (!a) return
    if (!/^[a-zA-Z0-9_-]{2,25}$/.test(a)) {
      setAliasError("2–25 chars: letters, numbers, hyphens, underscores")
      return
    }
    if (localAliases.includes(a)) { setAliasError("Already in list"); return }
    setLocalAliases((prev) => [...prev, a])
    setAliasInput("")
    setAliasError(null)
  }
  const removeLocalAlias = (alias: string) =>
    setLocalAliases((prev) => prev.filter((x) => x !== alias))

  // ── Dirty-check ─────────────────────────────────────────────────────────────
  const sortStr = (arr: string[]) => [...arr].sort().join("\0")
  const hasChanges =
    localUrl.trim() !== snapUrl ||
    sortStr(localTags) !== sortStr(snapTags) ||
    localStarred !== snapStarred ||
    sortStr(localAliases) !== sortStr(snapAliases)

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!state.open) return

    const trimmedUrl = localUrl.trim()
    if (!trimmedUrl) {
      toast.error("URL cannot be empty")
      return
    }

    setSaving(true)
    const errors: string[] = []

    // Destination URL
    if (trimmedUrl !== snapUrl) {
      try {
        const res = await fetch(`/api/urls/${state.url.short_code}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl }),
        })
        if (!res.ok) errors.push("Failed to update destination URL")
      } catch {
        errors.push("Failed to update destination URL")
      }
    }

    // Star
    if (localStarred !== snapStarred) {
      try {
        const res = await fetch(`/api/urls/${state.url.short_code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_starred: localStarred }),
        })
        if (!res.ok) errors.push("Failed to update star")
      } catch {
        errors.push("Failed to update star")
      }
    }

    // Tags diff
    const snapTagSet = new Set(snapTags)
    const currTagSet = new Set(localTags)
    for (const t of localTags.filter((x) => !snapTagSet.has(x))) {
      try { await addTag(state.url.id, t) }
      catch { errors.push(`Failed to add tag "${t}"`) }
    }
    for (const t of snapTags.filter((x) => !currTagSet.has(x))) {
      try { await removeTag(state.url.id, t) }
      catch { errors.push(`Failed to remove tag "${t}"`) }
    }

    // Aliases diff
    const snapAliasSet = new Set(snapAliases)
    const currAliasSet = new Set(localAliases)
    for (const a of localAliases.filter((x) => !snapAliasSet.has(x))) {
      try { await addAliasDirect(state.url.id, a) }
      catch (e) { errors.push(e instanceof Error ? e.message : `Failed to add "/${a}"`) }
    }
    for (const a of snapAliases.filter((x) => !currAliasSet.has(x))) {
      try { await removeAlias(state.url.id, a) }
      catch { errors.push(`Failed to remove "/${a}"`) }
    }

    setSaving(false)

    if (errors.length > 0) {
      toast.error(errors.join("\n"))
    } else {
      toast.success("Changes saved!")
    }

    onSuccessRef.current()
    onClose()
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      {state.open && (
        <DialogContent>
          {/* ── Header ──────────────────────────────────────────────────── */}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 min-w-0">
              <span className="truncate font-mono">/{state.url.short_code}</span>
              <button
                type="button"
                onClick={() => setLocalStarred((v) => !v)}
                className="shrink-0 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                aria-label={localStarred ? "Unstar" : "Star"}
                title={localStarred ? "Remove from starred" : "Mark as starred"}
              >
                <Star
                  className="h-5 w-5"
                  style={
                    localStarred
                      ? { fill: "#facc15", stroke: "#ca8a04" }
                      : { fill: "transparent", stroke: "currentColor", opacity: 0.4 }
                  }
                />
              </button>
            </DialogTitle>
            <DialogDescription className="text-xs break-all line-clamp-2">
              {makeShortUrl(state.url)}
            </DialogDescription>
          </DialogHeader>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Destination URL */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-dest-url" className="text-sm font-medium">
                Destination URL
              </Label>
              <Input
                id="edit-dest-url"
                type="url"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="https://…"
                className="w-full"
              />
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setTagError(null) }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault()
                      addLocalTag()
                    }
                  }}
                  placeholder="Type a tag and press Enter…"
                  className="flex-1 min-w-0"
                  maxLength={51}
                />
                <Button type="button" variant="outline" size="sm" onClick={addLocalTag} className="shrink-0">
                  Add
                </Button>
              </div>
              {tagError && <p className="text-xs text-destructive">{tagError}</p>}
              {localTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {localTags.map((tag) => {
                    const c = getTagColor(tag)
                    return (
                      <span
                        key={tag}
                        style={{
                          backgroundColor: c.bg,
                          color: c.text,
                          border: `1px solid ${c.border}`,
                        }}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeLocalTag(tag)}
                          className="hover:opacity-70 focus:outline-none"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No tags yet.</p>
              )}
            </div>

            {/* Aliases */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Aliases</Label>
              <div className="flex gap-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => { setAliasInput(e.target.value); setAliasError(null) }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addLocalAlias() }
                  }}
                  placeholder="Add alias short code…"
                  className="flex-1 min-w-0"
                />
                <Button type="button" variant="outline" size="sm" onClick={addLocalAlias} className="shrink-0">
                  Add
                </Button>
              </div>
              {aliasError && <p className="text-xs text-destructive">{aliasError}</p>}
              {localAliases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {localAliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      /{alias}
                      <button
                        type="button"
                        onClick={() => removeLocalAlias(alias)}
                        className="ml-0.5 hover:text-destructive focus:outline-none"
                        aria-label={`Remove alias /${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No aliases yet.</p>
              )}
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
