"use server"

import type { SubmissionResult } from "@conform-to/react"
import { parseWithZod } from "@conform-to/zod"
import { z } from "zod"
import { urlService } from "./url-service"
import { aliasSchema, createUrlSchema, shortCodeValidator } from "./validations"

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

  // Extract array fields submitted as field[0], field[1], …
  const extractArray = (prefix: string) => {
    const values: string[] = []
    for (const [key, value] of formData.entries()) {
      if (key.startsWith(`${prefix}[`) && typeof value === "string" && value) {
        values.push(value)
      }
    }
    return values
  }

  if (submission.status === "success") {
    try {
      await urlService.createShortUrl(
        submission.value.url,
        submission.value.shortCode,
        extractArray("aliases"),
        extractArray("tags")
      )
      result.error = null
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Failed to create URL"
    }
  }
  return result
}

export async function addTag(urlId: number, tagName: string) {
  await urlService.addTag(urlId, tagName)
}

export async function removeTag(urlId: number, tagName: string) {
  await urlService.removeTag(urlId, tagName)
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

export async function addAliasDirect(urlId: number, aliasCode: string) {
  await urlService.addAlias(urlId, aliasCode)
}

export async function getAliasStatsDirect(urlId: number) {
  const id = z.number().int().positive().parse(urlId)
  return urlService.getAliasStats(id)
}

export async function renameShortCodeAction(oldCode: string, newCode: string) {
  shortCodeValidator.parse(oldCode)
  shortCodeValidator.parse(newCode)
  return urlService.renameShortCode(oldCode, newCode)
}

export async function promoteAliasAction(urlId: number, aliasCode: string) {
  const id = z.number().int().positive().parse(urlId)
  shortCodeValidator.parse(aliasCode)
  return urlService.promoteAlias(id, aliasCode)
}
