"use server"

import type { SubmissionResult } from "@conform-to/react"
import { parseWithZod } from "@conform-to/zod"
import { urlService } from "./url-service"
import { aliasSchema, createUrlSchema, editUrlSchema } from "./validations"

export async function createUrl(
  prevState: {
    error: string | null
    lastResult: SubmissionResult<string[]> | null
  },
  formData: FormData
) {
  const submission = parseWithZod(formData, { schema: createUrlSchema })

  const result: typeof prevState = {
    ...prevState,
    lastResult: submission.reply(),
  }

  // Extract aliases manually (submitted as aliases[0], aliases[1] … hidden inputs)
  const aliases: string[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("aliases[") && typeof value === "string" && value) {
      aliases.push(value)
    }
  }

  if (submission.status === "success") {
    try {
      await urlService.createShortUrl(
        submission.value.url,
        submission.value.shortCode,
        aliases.length > 0 ? aliases : undefined
      )
      result.error = null
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Failed to create URL"
    }
  }
  return result
}

export async function editUrl(
  prevState: {
    error: string | null
    lastResult: SubmissionResult<string[]> | null
  },
  formData: FormData
) {
  const submission = parseWithZod(formData, { schema: editUrlSchema })
  const result: typeof prevState = {
    ...prevState,
    lastResult: submission.reply(),
  }

  if (submission.status === "success") {
    try {
      await urlService.updateUrl(
        submission.value.shortCode,
        submission.value.url
      )
      result.error = null
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Failed to update URL"
    }
  }
  return result
}

export async function addAlias(
  prevState: {
    error: string | null
    lastResult: SubmissionResult<string[]> | null
  },
  formData: FormData
) {
  const submission = parseWithZod(formData, { schema: aliasSchema })
  const result: typeof prevState = {
    ...prevState,
    lastResult: submission.reply(),
  }

  const urlId = Number(formData.get("urlId"))

  if (submission.status === "success" && urlId) {
    try {
      await urlService.addAlias(urlId, submission.value.aliasCode)
      result.error = null
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Failed to add alias"
    }
  }
  return result
}

export async function removeAlias(urlId: number, aliasCode: string) {
  await urlService.removeAlias(urlId, aliasCode)
}
