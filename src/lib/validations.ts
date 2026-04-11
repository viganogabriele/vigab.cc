import { z } from "zod"

const shortCodeValidator = z
  .string()
  .min(2, "Short code must be at least 2 characters")
  .max(25, "Short code must be at most 25 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Short code can only contain letters, numbers, hyphens and underscores"
  )

const tagValidator = z.string().min(1).max(50).trim()

export const createUrlSchema = z.object({
  url: z.string().url("Invalid URL format"),
  shortCode: shortCodeValidator.optional(),
  aliases: z.array(shortCodeValidator).optional(),
  tags: z.array(tagValidator).optional(),
})

export type CreateUrlInput = z.infer<typeof createUrlSchema>

export const editUrlSchema = createUrlSchema.extend({
  shortCode: shortCodeValidator,
})

export const aliasSchema = z.object({
  aliasCode: shortCodeValidator,
})

export const tagSchema = z.object({
  tagName: tagValidator,
})

/** Only patches is_starred now — tags are managed via dedicated endpoints */
export const patchUrlSchema = z.object({
  is_starred: z.boolean().optional(),
})

export type PatchUrlInput = z.infer<typeof patchUrlSchema>
