import { initContract } from "@ts-rest/core"
import z from "zod"
import {
  AliasRecord,
  GetUrlsQueryParams,
  PaginatedUrlsResponse,
  URLRecord,
} from "./schemas"
import { createUrlSchema } from "./validations"

const c = initContract()

const APIError = z.object({
  error: z.string(),
})

const aliasBody = z.object({ aliasCode: z.string().min(2).max(25) })

export const contract = c.router({
  getAllUrls: {
    method: "GET",
    path: "/urls",
    query: GetUrlsQueryParams,
    responses: {
      200: PaginatedUrlsResponse,
    },
    summary: "Get all URLs with pagination and filters",
  },
  getUrl: {
    method: "GET",
    path: "/urls/:shortCode",
    responses: {
      200: URLRecord,
      404: APIError,
    },
    summary: "Get URL by short code",
  },
  createUrl: {
    method: "POST",
    path: "/urls",
    body: createUrlSchema,
    responses: {
      201: URLRecord,
    },
    summary: "Create a new short URL",
  },
  updateUrl: {
    method: "PUT",
    path: "/urls/:shortCode",
    body: createUrlSchema,
    responses: {
      200: URLRecord,
      404: APIError,
    },
    summary: "Update a short URL",
  },
  deleteUrl: {
    method: "DELETE",
    path: "/urls/:shortCode",
    responses: {
      204: z.void(),
      404: APIError,
    },
    summary: "Delete a short URL",
  },
  addAlias: {
    method: "POST",
    path: "/urls/:shortCode/aliases",
    body: aliasBody,
    responses: {
      201: AliasRecord,
      400: APIError,
      404: APIError,
    },
    summary: "Add an alias to a short URL",
  },
  removeAlias: {
    method: "DELETE",
    path: "/urls/:shortCode/aliases/:aliasCode",
    responses: {
      204: z.void(),
      404: APIError,
    },
    summary: "Remove an alias from a short URL",
  },
})
