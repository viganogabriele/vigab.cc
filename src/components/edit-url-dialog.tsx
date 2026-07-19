"use client"

import { ArrowUpToLine, Star, X } from "lucide-react"
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
import { env } from "@/env"
import {
  addAliasDirect,
  addTag,
  promoteAliasAction,
  removeAlias,
  removeTag,
  renameShortCodeAction,
} from "@/lib/actions"
import type { UrlRecord } from "@/lib/schemas"
import { getTagColor, makeShortUrl } from "@/lib/utils"
import { Badge } from "./ui/badge"

export type EditDialogState = { open: false } | { open: true; url: UrlRecord }

type EditUrlDialogProps = EditDialogState & {
  onClose: () => void
  onSuccess: () => void
}

export function EditUrlDialog({
  onClose,
  onSuccess,
  ...state
}: EditUrlDialogProps) {
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  // ── Snapshots stored as state (React Compiler tracks these correctly) ───────
  const [snapTags, setSnapTags] = useState<string[]>([])
  const [snapStarred, setSnapStarred] = useState(false)
  const [snapAliases, setSnapAliases] = useState<string[]>([])
  const [snapUrl, setSnapUrl] = useState("")
  const [snapShortCode, setSnapShortCode] = useState("")

  // ── Working copies — nothing sent to server until Save ─────────────────────
  const [localTags, setLocalTags] = useState<string[]>([])
  const [localStarred, setLocalStarred] = useState(false)
  const [localAliases, setLocalAliases] = useState<string[]>([])
  const [localUrl, setLocalUrl] = useState("")
  const [localShortCode, setLocalShortCode] = useState("")

  // ── Tag / alias inputs ──────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("")
  const [tagError, setTagError] = useState<string | null>(null)
  const [aliasInput, setAliasInput] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [shortCodeError, setShortCodeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [promoting, setPromoting] = useState<string | null>(null)

  // ── Reset whenever the dialog opens or a different URL is loaded ────────────
  const urlId = state.open ? state.url.id : 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset only when the dialog opens or the URL id changes, not on every field update
  useEffect(() => {
    if (!state.open) return

    const tags = state.url.tags ?? []
    const aliases = state.url.aliases ?? []
    const starred = state.url.is_starred
    const url = state.url.original_url
    const shortCode = state.url.short_code

    setSnapTags(tags)
    setSnapStarred(starred)
    setSnapAliases(aliases)
    setSnapUrl(url)
    setSnapShortCode(shortCode)

    setLocalTags([...tags])
    setLocalStarred(starred)
    setLocalAliases([...aliases])
    setLocalUrl(url)
    setLocalShortCode(shortCode)

    setTagInput("")
    setTagError(null)
    setAliasInput("")
    setAliasError(null)
    setShortCodeError(null)
    setSaving(false)
  }, [state.open, urlId])

  // ── Tag helpers ─────────────────────────────────────────────────────────────
  const addLocalTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (t.length > 50) {
      setTagError("Max 50 characters")
      return
    }
    if (localTags.includes(t)) {
      setTagError("Tag already in list")
      return
    }
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
    if (localAliases.includes(a)) {
      setAliasError("Already in list")
      return
    }
    setLocalAliases((prev) => [...prev, a])
    setAliasInput("")
    setAliasError(null)
  }
  const removeLocalAlias = (alias: string) =>
    setLocalAliases((prev) => prev.filter((x) => x !== alias))

  const handlePromote = async (alias: string) => {
    if (!state.open) return
    if (hasChanges) {
      toast.error("Salva le modifiche prima di impostare il codice primario")
      return
    }
    setPromoting(alias)
    try {
      const result = await promoteAliasAction(state.url.id, alias)
      if (!result) {
        toast.error("Alias non trovato")
      } else {
        toast.success(`/${alias} è ora il codice primario`)
        onSuccessRef.current()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione fallita")
    } finally {
      setPromoting(null)
    }
  }

  // ── Dirty-check ─────────────────────────────────────────────────────────────
  const sortStr = (arr: string[]) => [...arr].sort().join("\0")
  const hasChanges =
    localUrl.trim() !== snapUrl ||
    localShortCode.trim() !== snapShortCode ||
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

    // Preflight format check before any mutations fire
    const trimmedCode = localShortCode.trim()
    if (
      trimmedCode !== snapShortCode &&
      !/^[a-zA-Z0-9_-]{2,25}$/.test(trimmedCode)
    ) {
      setShortCodeError("2–25 chars: letters, numbers, hyphens, underscores")
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
      try {
        await addTag(state.url.id, t)
      } catch {
        errors.push(`Failed to add tag "${t}"`)
      }
    }
    for (const t of snapTags.filter((x) => !currTagSet.has(x))) {
      try {
        await removeTag(state.url.id, t)
      } catch {
        errors.push(`Failed to remove tag "${t}"`)
      }
    }

    // Aliases diff
    const snapAliasSet = new Set(snapAliases)
    const currAliasSet = new Set(localAliases)
    for (const a of localAliases.filter((x) => !snapAliasSet.has(x))) {
      try {
        await addAliasDirect(state.url.id, a)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `Failed to add "/${a}"`)
      }
    }
    for (const a of snapAliases.filter((x) => !currAliasSet.has(x))) {
      try {
        await removeAlias(state.url.id, a)
      } catch {
        errors.push(`Failed to remove "/${a}"`)
      }
    }

    // Short code rename — must fire last since other calls used the original code
    let renameFailed = false
    if (trimmedCode !== snapShortCode) {
      try {
        const result = await renameShortCodeAction(snapShortCode, trimmedCode)
        if (!result) {
          setShortCodeError("Short code not found — rename failed")
          renameFailed = true
        }
      } catch (e) {
        setShortCodeError(
          e instanceof Error ? e.message : "Failed to rename short code"
        )
        renameFailed = true
      }
    }

    setSaving(false)
    onSuccessRef.current()

    if (errors.length > 0) {
      toast.error(errors.join("\n"))
    }

    if (!renameFailed) {
      if (errors.length === 0) toast.success("Changes saved!")
      onClose()
    }
    // Rename failed: keep dialog open so user sees the inline error
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      {state.open && (
        <DialogContent>
          {/* ── Header ──────────────────────────────────────────────────── */}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 min-w-0">
              <span className="truncate font-mono">
                /{state.url.short_code}
              </span>
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
                      : {
                          fill: "transparent",
                          stroke: "currentColor",
                          opacity: 0.4,
                        }
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
            {/* Short code */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-short-code" className="text-sm font-medium">
                Short code
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm font-mono shrink-0">
                  {env.NEXT_PUBLIC_DOMAIN}/
                </span>
                <Input
                  id="edit-short-code"
                  value={localShortCode}
                  onChange={(e) => {
                    setLocalShortCode(e.target.value)
                    setShortCodeError(null)
                  }}
                  className="font-mono flex-1 min-w-0"
                />
              </div>
              {shortCodeError && (
                <p className="text-xs text-destructive">{shortCodeError}</p>
              )}
            </div>

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
                  onChange={(e) => {
                    setTagInput(e.target.value)
                    setTagError(null)
                  }}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLocalTag}
                  className="shrink-0"
                >
                  Add
                </Button>
              </div>
              {tagError && (
                <p className="text-xs text-destructive">{tagError}</p>
              )}
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
                  onChange={(e) => {
                    setAliasInput(e.target.value)
                    setAliasError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addLocalAlias()
                    }
                  }}
                  placeholder="Add alias short code…"
                  className="flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLocalAlias}
                  className="shrink-0"
                >
                  Add
                </Button>
              </div>
              {aliasError && (
                <p className="text-xs text-destructive">{aliasError}</p>
              )}
              {localAliases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {localAliases.map((alias) => (
                    <span key={alias} className="flex items-center gap-1">
                      <Badge variant="secondary" className="gap-1">
                        /{alias}
                        <button
                          type="button"
                          onClick={() => removeLocalAlias(alias)}
                          disabled={promoting !== null || saving}
                          className="ml-0.5 hover:text-destructive focus:outline-none disabled:opacity-40"
                          aria-label={`Remove alias /${alias}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handlePromote(alias)}
                        disabled={promoting !== null || saving}
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 focus:outline-none"
                        title={`Imposta /${alias} come codice primario`}
                        aria-label={`Imposta /${alias} come codice primario`}
                      >
                        {promoting === alias ? (
                          "…"
                        ) : (
                          <ArrowUpToLine className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No aliases yet.</p>
              )}
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
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
