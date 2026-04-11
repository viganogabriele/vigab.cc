"use client"

import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { getZodConstraint, parseWithZod } from "@conform-to/zod"
import { nanoid } from "nanoid"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
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
import { createUrl } from "@/lib/actions"
import { createUrlSchema } from "@/lib/validations"
import { RandomText } from "./random-text"
import { X } from "lucide-react"
import { Badge } from "./ui/badge"

interface CreateUrlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
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
    onValidate: ({ formData }) =>
      parseWithZod(formData, { schema: createUrlSchema }),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  })

  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  useEffect(() => {
    if (lastResult && !error) {
      toast.success("Short URL created successfully!")
      setAliases([])
      setAliasInput("")
      onSuccessRef.current()
    } else if (lastResult && error) {
      console.error("Error creating URL:", error)
      toast.error(`Error creating URL: ${error}`)
    }
  }, [lastResult, error])

  const randomCode = useCallback(() => nanoid(8), [])
  const isRandom = !(fields.shortCode.value && fields.shortCode.valid)

  // Aliases state (managed locally; submitted as hidden inputs)
  const [aliases, setAliases] = useState<string[]>([])
  const [aliasInput, setAliasInput] = useState("")
  const [aliasError, setAliasError] = useState<string | null>(null)

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
    setAliases((prev) => [...prev, trimmed])
    setAliasInput("")
    setAliasError(null)
  }

  const removeAlias = (alias: string) => {
    setAliases((prev) => prev.filter((a) => a !== alias))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Short URL</DialogTitle>
          <DialogDescription>
            Enter a URL to create a shortened version. Optionally specify a
            custom short code and aliases.
          </DialogDescription>
        </DialogHeader>
        <form {...getFormProps(form, {})} action={action}>
          <div>{form.errors}</div>
          <div className="grid grid-cols-4 gap-x-4 py-4">
            <span
              id={fields.url.errorId}
              className="text-xs col-start-2 col-span-3 text-red-600 text-center"
            >
              {fields.url.errors}
            </span>
            <div className="grid col-span-4 grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor={fields.url.id} className="text-right">
                URL
              </Label>
              <Input
                {...getInputProps(fields.url, { type: "url" })}
                placeholder="https://example.polinetwork.org/path"
                className="col-span-3"
              />
            </div>
            <span
              id={fields.shortCode.errorId}
              className="text-xs col-start-2 col-span-3 text-red-600 text-center"
            >
              {fields.shortCode.errors?.join(", ")}
            </span>
            <div className="grid col-span-4 grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor={fields.shortCode.id} className="text-right">
                Short Code
              </Label>
              <Input
                {...getInputProps(fields.shortCode, { type: "text" })}
                placeholder="custom-code (optional)"
                className="col-span-3"
                title="Short code can only contain letters, numbers, hyphens and underscores (2-25 characters)"
              />
            </div>

            {/* Aliases section */}
            <div className="col-span-4 mb-2">
              <Label className="text-sm mb-1 block">Aliases (optional)</Label>
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
                      addAlias()
                    }
                  }}
                  placeholder="wiki, wikipedia, word…"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addAlias}>
                  Add
                </Button>
              </div>
              {aliasError && (
                <p className="text-xs text-red-600 mt-1">{aliasError}</p>
              )}
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {aliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      {alias}
                      <button
                        type="button"
                        onClick={() => removeAlias(alias)}
                        className="ml-1 hover:text-destructive"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Hidden inputs to submit aliases as form data */}
              {aliases.map((alias, i) => (
                <input
                  key={alias}
                  type="hidden"
                  name={`aliases[${i}]`}
                  value={alias}
                />
              ))}
            </div>

            <div className="col-span-4 text-sm text-muted-foreground">
              If you leave <i>Short Code</i> empty, a random one will be
              auto-generated upon submission.
            </div>
          </div>
          <p className="text-xs">Preview: </p>
          <div className="text-sm p-4 border rounded-md border-border mb-4 mt-1 flex flex-col gap-1 bg-muted/50 text-muted-foreground">
            <p className="font-mono mx-auto">
              https://{env.NEXT_PUBLIC_DOMAIN}/
              {isRandom ? (
                <RandomText generate={randomCode} />
              ) : (
                <span>{fields.shortCode.value}</span>
              )}
            </p>
            {aliases.map((alias) => (
              <p key={alias} className="font-mono mx-auto text-xs opacity-70">
                https://{env.NEXT_PUBLIC_DOMAIN}/{alias}
              </p>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
