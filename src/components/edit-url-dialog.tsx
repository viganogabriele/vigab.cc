"use client"

import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { getZodConstraint, parseWithZod } from "@conform-to/zod"
import { X } from "lucide-react"
import { useActionState, useEffect, useRef, useState } from "react"
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
import { addAlias, editUrl, removeAlias } from "@/lib/actions"
import type { UrlRecord } from "@/lib/schemas"
import { makeShortUrl } from "@/lib/utils"
import { editUrlSchema } from "@/lib/validations"
import { Badge } from "./ui/badge"

export type EditDialogState =
  | {
      open: false
    }
  | {
      open: true
      url: UrlRecord
    }

type EditUrlDialogProps = EditDialogState & {
  onClose: () => void
  onSuccess: () => void
}

export function EditUrlDialog({
  onClose,
  onSuccess,
  ...state
}: EditUrlDialogProps) {
  const [{ error, lastResult }, action, pending] = useActionState(editUrl, {
    error: null,
    lastResult: null,
  })
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(editUrlSchema),
    onValidate: ({ formData }) =>
      parseWithZod(formData, { schema: editUrlSchema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  })

  // Use a ref for onSuccess to prevent effect re-runs when the callback identity changes
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  useEffect(() => {
    if (lastResult && !error) {
      toast.success("Short URL edited successfully!")
      onSuccessRef.current()
    } else if (lastResult && error) {
      console.error("Error editing URL:", error)
      toast.error(`Error editing URL: ${error}`)
    }
  }, [lastResult, error])

  // Alias management (local state mirroring what's in the DB)
  const urlAliases = state.open ? (state.url.aliases ?? []) : []
  const [localAliases, setLocalAliases] = useState<string[]>(urlAliases)
  const [aliasInput, setAliasInput] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [aliasLoading, setAliasLoading] = useState(false)

  // Sync when dialog opens with a new URL
  useEffect(() => {
    if (state.open) {
      setLocalAliases(state.url.aliases ?? [])
      setAliasInput("")
      setAliasError(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open ? state.url.id : null])

  const handleAddAlias = async () => {
    if (!state.open) return
    const trimmed = aliasInput.trim()
    if (!trimmed) return
    if (!/^[a-zA-Z0-9_-]{2,25}$/.test(trimmed)) {
      setAliasError("2–25 chars, letters/numbers/hyphens/underscores only")
      return
    }
    if (localAliases.includes(trimmed)) {
      setAliasError("Alias already added")
      return
    }
    setAliasLoading(true)
    try {
      const fd = new FormData()
      fd.set("urlId", String(state.url.id))
      fd.set("aliasCode", trimmed)
      const result = await addAlias({ error: null, lastResult: null }, fd)
      if (result.error) {
        setAliasError(result.error)
      } else {
        setLocalAliases((prev) => [...prev, trimmed])
        setAliasInput("")
        setAliasError(null)
        toast.success(`Alias "/${trimmed}" added`)
        onSuccessRef.current()
      }
    } catch {
      setAliasError("Failed to add alias")
    } finally {
      setAliasLoading(false)
    }
  }

  const handleRemoveAlias = async (alias: string) => {
    if (!state.open) return
    setAliasLoading(true)
    try {
      await removeAlias(state.url.id, alias)
      setLocalAliases((prev) => prev.filter((a) => a !== alias))
      toast.success(`Alias "/${alias}" removed`)
      onSuccessRef.current()
    } catch {
      toast.error("Failed to remove alias")
    } finally {
      setAliasLoading(false)
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      {state.open && (
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Short URL</DialogTitle>
            <DialogDescription>
              Update the destination URL for {makeShortUrl(state.url)}.
            </DialogDescription>
          </DialogHeader>
          <form {...getFormProps(form, {})} action={action}>
            <div className="grid grid-cols-4 gap-x-4 py-4">
              <span
                id={fields.shortCode.errorId}
                className="text-xs col-start-2 col-span-3 text-red-600 text-center"
              >
                {fields.shortCode.errors?.join(", ")}
              </span>
              <div className="grid grid-cols-4 col-span-4 items-center gap-4 mb-4">
                <Label htmlFor={fields.shortCode.id} className="text-right">
                  Short Code
                </Label>
                <Input
                  {...getInputProps(fields.shortCode, { type: "text" })}
                  value={state.url.short_code}
                  className="col-span-3"
                  tabIndex={-1}
                  aria-disabled
                  aria-readonly
                  readOnly
                />
              </div>
              <span
                id={fields.url.errorId}
                className="text-xs col-start-2 col-span-3 text-red-600 text-center"
              >
                {fields.url.errors?.join(", ")}
              </span>
              <div className="grid grid-cols-4 col-span-4 items-center gap-4">
                <Label htmlFor={fields.url.id} className="text-right">
                  URL
                </Label>
                <Input
                  {...getInputProps(fields.url, { type: "url" })}
                  placeholder="https://example.polinetwork.org/path"
                  className="col-span-3"
                />
              </div>
            </div>

            {/* Alias management */}
            <div className="mb-4">
              <Label className="text-sm mb-2 block">Aliases</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => {
                    setAliasInput(e.target.value)
                    setAliasError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddAlias()
                    }
                  }}
                  placeholder="Add alias short code…"
                  className="flex-1"
                  disabled={aliasLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddAlias}
                  disabled={aliasLoading}
                >
                  Add
                </Button>
              </div>
              {aliasError && (
                <p className="text-xs text-red-600 mb-1">{aliasError}</p>
              )}
              {localAliases.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {localAliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      /{alias}
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(alias)}
                        disabled={aliasLoading}
                        className="ml-1 hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No aliases yet. Add one above.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onClose()}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !form.valid}>
                {pending ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
