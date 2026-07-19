import { createNextHandler } from "@ts-rest/serverless/next"
import { analyticsService } from "@/lib/analytics-service"
import { contract } from "@/lib/contract"
import { urlService } from "@/lib/url-service"

const handler = createNextHandler(
  contract,
  {
    getAllUrls: async ({ query }) => ({
      status: 200,
      body: await urlService.getAllUrls(query),
    }),

    createUrl: async ({ body }) => {
      try {
        const urlRecord = await urlService.createShortUrl(
          body.url,
          body.shortCode,
          body.aliases,
          body.tags
        )
        return { status: 201, body: urlRecord }
      } catch (error) {
        return {
          status: 400,
          body: {
            error:
              error instanceof Error ? error.message : "Failed to create URL",
          },
        }
      }
    },

    getUrl: async ({ params }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      return { status: 200, body: urlRecord }
    },

    updateUrl: async ({ params, body }) => {
      const urlRecord = await urlService.updateUrl(params.shortCode, body.url)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      return { status: 200, body: urlRecord }
    },

    patchUrl: async ({ params, body }) => {
      const urlRecord = await urlService.patchUrl(params.shortCode, body)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      return { status: 200, body: urlRecord }
    },

    deleteUrl: async ({ params }) => {
      const deleted = await urlService.deleteUrl(params.shortCode)
      if (!deleted) return { status: 404, body: { error: "URL not found" } }
      return { status: 204, body: undefined }
    },

    getAllTags: async () => ({
      status: 200,
      body: await urlService.getAllTags(),
    }),

    addTag: async ({ params, body }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      try {
        await urlService.addTag(urlRecord.id, body.tagName)
        return { status: 201, body: undefined }
      } catch (error) {
        return {
          status: 400,
          body: {
            error: error instanceof Error ? error.message : "Failed to add tag",
          },
        }
      }
    },

    removeTag: async ({ params }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      const deleted = await urlService.removeTag(urlRecord.id, params.tagName)
      if (!deleted) return { status: 404, body: { error: "Tag not found" } }
      return { status: 204, body: undefined }
    },

    addAlias: async ({ params, body }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      try {
        await urlService.addAlias(urlRecord.id, body.aliasCode)
        const aliasRow = await urlService.getAliasRow(
          urlRecord.id,
          body.aliasCode
        )
        if (!aliasRow)
          return {
            status: 500,
            body: { error: "Alias not found after creation" },
          }
        return { status: 201, body: aliasRow }
      } catch (error) {
        return {
          status: 400,
          body: {
            error:
              error instanceof Error ? error.message : "Failed to add alias",
          },
        }
      }
    },

    removeAlias: async ({ params }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      const deleted = await urlService.removeAlias(
        urlRecord.id,
        params.aliasCode
      )
      if (!deleted) return { status: 404, body: { error: "Alias not found" } }
      return { status: 204, body: undefined }
    },

    promoteAlias: async ({ params }) => {
      const urlRecord = await urlService.getUrlByShortCode(params.shortCode)
      if (!urlRecord) return { status: 404, body: { error: "URL not found" } }
      try {
        const updated = await urlService.promoteAlias(
          urlRecord.id,
          params.aliasCode
        )
        if (!updated) return { status: 404, body: { error: "Alias not found" } }
        return { status: 200, body: updated }
      } catch (error) {
        return {
          status: 400,
          body: {
            error:
              error instanceof Error
                ? error.message
                : "Failed to promote alias",
          },
        }
      }
    },

    getAnalytics: async ({ params }) => {
      const analytics = await analyticsService.getAnalytics(params.shortCode)
      if (!analytics) return { status: 404, body: { error: "URL not found" } }
      return { status: 200, body: analytics }
    },
  },
  { handlerType: "app-router", basePath: "/api" }
)

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
}
