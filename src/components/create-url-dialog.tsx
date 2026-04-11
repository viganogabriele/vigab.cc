"use client"

import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { getZodConstraint, parseWithZod } from "@conform-to/zod"
import { nanoid } from "nanoid"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { X } from "lucide-react"
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
import { createUrl } from "@/lib/actions"
import { getTagColor } from "@/lib/utils"
import { createUrlSchema } from "@/lib/validations"
import { Badge } from "./ui/badge"
import { RandomText } from "./random-text"

interface CreateUrlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

/** Inline tag chip input — Enter or comma adds a tag */
function TagChipInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const trimmed = input.trim().replace(/,+$/, "")
    if (!trimmed) return
    if (trimmed.length > 50) {
      setError("Tag must be at most 50 characters")
      return
    }
    if (tags.includes(trimmed)) {
      setError("Tag already added")
      return
    }
    onChange([...tags, trimmed])
    setInput("")
    setError(null)
  }

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag))

  return (
    <div className="col-span-3 space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add()
            }
          }}
          placeholder="e.g. work, personal…"
          className="flex-1"
          maxLength={51}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => {
            const c = getTagColor(tag)
            return (
              <span
                key={tag}
                style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  className="hover:opacity-70"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CreateUrlDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateUrlDialogProps) {
  const [{ error, lastResult }, action, pending] = useActionState(createUrl, {
    error: null,
    lastResult: null,
  })
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(createUrlSchema),
    onValidate: ({ formData }) => parseWithZod(formData, { schema: createUrlSchema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  })

  const onSuccessRef = useRef(onSuccess)
  useEffect(() => { onSuccessRef.current = onSuccess })

  const [tags, setTags] = useState<string[]>([])
  const [aliases, setAliases] = useState<string[]>([])
  const [aliasInput, setAliasInput] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)

  useEffect(() => {
    if (lastResult && !error) {
      toast.success("Short URL created successfully!")
      setTags([])
      setAliases([])
      setAliasInput("")
      onSuccessRef.current()
    } else if (lastResult && error) {
      toast.error(`Error creating URL: ${error}`)
    }
  }, [lastResult, error])

  const randomCode = useCallback(() => nanoid(8), [])
  const isRandom = !(fields.shortCode.value && fields.shortCode.valid)

  const addAlias = () => {
    const trimmed = aliasInput.trim()
    if (!trimmed) return
    if (!/^[a-zA-Z0-9_-]{2,25}$/.test(trimmed)) {
      setAliasError("2–25 chars, letters/numbers/hyphens/underscores only")
      return
    }
    if (aliases.includes(trimmed)) {
      setAliasError("Alias already added")
      return
    }
    setAliases((p) => [...p, trimmed])
    setAliasInput("")
    setAliasError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create Short URL</DialogTitle>
          <DialogDescription>
            Enter a URL to shorten. Optionally add a custom code, tags, and aliases.
          </DialogDescription>
        </DialogHeader>
        <form {...getFormProps(form, {})} action={action}>
          <div className="grid grid-cols-4 gap-x-4 py-4 space-y-1">
            {/* URL */}
            <span className="text-xs col-start-2 col-span-3 text-red-600 text-center">
              {fields.url.errors}
            </span>
            <div className="grid col-span-4 grid-cols-4 items-center gap-4 mb-2">
              <Label htmlFor={fields.url.id} className="text-right">URL</Label>
              <Input
                {...getInputProps(fields.url, { type: "url" })}
                placeholder="https://example.com/path"
                className="col-span-3"
              />
            </div>

            {/* Short Code */}
            <span className="text-xs col-start-2 col-span-3 text-red-600 text-center">
              {fields.shortCode.errors?.join(", ")}
            </span>
            <div className="grid col-span-4 grid-cols-4 items-center gap-4 mb-2">
              <Label htmlFor={fields.shortCode.id} className="text-right">Short Code</Label>
              <Input
                {...getInputProps(fields.shortCode, { type: "text" })}
                placeholder="custom-code (optional)"
                className="col-span-3"
                title="2-25 chars, letters/numbers/hyphens/underscores"
              />
            </div>

            {/* Tags */}
            <div className="grid col-span-4 grid-cols-4 items-start gap-4 mb-2">
              <Label className="text-right pt-2">Tags</Label>
              <TagChipInput tags={tags} onChange={setTags} />
            </div>
            {/* Hidden inputs for tags */}
            {tags.map((tag, i) => (
              <input key={tag} type="hidden" name={`tags[${i}]`} value={tag} />
            ))}

            {/* Aliases */}
            <div className="col-span-4 mb-2">
              <Label className="text-sm mb-1 block">Aliases (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => { setAliasInput(e.target.value); setAliasError(null) }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias() } }}
                  placeholder="wiki, wikipedia, word…"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addAlias}>Add</Button>
              </div>
              {aliasError && <p className="text-xs text-red-600 mt-1">{aliasError}</p>}
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {aliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      {alias}
                      <button
                        type="button"
                        onClick={() => setAliases((p) => p.filter((a) => a !== alias))}
                        className="ml-1 hover:text-destructive"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {aliases.map((alias, i) => (
                <input key={alias} type="hidden" name={`aliases[${i}]`} value={alias} />
              ))}
            </div>

            <div className="col-span-4 text-sm text-muted-foreground">
              Leave <i>Short Code</i> empty to auto-generate one.
            </div>
          </div>

          {/* Preview */}
          <p className="text-xs">Preview:</p>
          <div className="text-sm p-3 border rounded-md border-border mb-4 mt-1 flex flex-col gap-1 bg-muted/50 text-muted-foreground">
            <p className="font-mono mx-auto">
              https://{env.NEXT_PUBLIC_DOMAIN}/
              {isRandom ? <RandomText generate={randomCode} /> : <span>{fields.shortCode.value}</span>}
            </p>
            {aliases.map((alias) => (
              <p key={alias} className="font-mono mx-auto text-xs opacity-70">
                https://{env.NEXT_PUBLIC_DOMAIN}/{alias}
              </p>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
