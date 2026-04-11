import { nanoid } from "nanoid"
import { getPool } from "./db"
import {
  type GetUrlsQueryParams,
  type PaginatedUrlsResponse,
  URLRecord,
  URLRecords,
  type UrlRecord,
} from "./schemas"

export class UrlService {
  private pool = getPool()

  async createShortUrl(
    originalUrl: string,
    customShortCode?: string,
    aliases?: string[]
  ): Promise<UrlRecord> {
    let shortCode: string
    let isCustom = true

    if (customShortCode) {
      // Check if custom short code already exists (in urls or url_aliases)
      const existingUrl = await this.getUrlByShortCode(customShortCode)
      if (existingUrl) {
        throw new Error(
          "Short code already exists. Please choose a different one."
        )
      }
      shortCode = customShortCode
    } else {
      // Generate a unique short code
      shortCode = nanoid(8)
      isCustom = false
    }

    const query = `
      INSERT INTO urls (original_url, short_code, is_custom)
      VALUES ($1, $2, $3)
      RETURNING *
    `

    const result = await this.pool.query(query, [
      originalUrl,
      shortCode,
      isCustom,
    ])
    const urlRecord = result.rows[0]

    // Insert aliases if provided
    if (aliases && aliases.length > 0) {
      for (const alias of aliases) {
        await this.addAlias(urlRecord.id, alias)
      }
    }

    return this.attachAliases(urlRecord)
  }

  /** Looks up a URL by its primary short_code OR an alias code */
  async getUrlByShortCode(shortCode: string): Promise<UrlRecord | null> {
    const query = `
      SELECT u.*,
        COALESCE(
          (SELECT array_agg(a.alias_code ORDER BY a.created_at)
           FROM url_aliases a
           WHERE a.url_id = u.id),
          '{}'
        ) AS aliases
      FROM urls u
      WHERE u.short_code = $1
         OR u.id = (SELECT url_id FROM url_aliases WHERE alias_code = $1 LIMIT 1)
      LIMIT 1
    `
    const result = await this.pool.query(query, [shortCode])
    if (!result.rows[0]) return null
    const row = result.rows[0]
    return URLRecord.parse({ ...row, aliases: row.aliases ?? [] })
  }


  async getAllUrls(
    options: Partial<GetUrlsQueryParams>
  ): Promise<PaginatedUrlsResponse> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = "created_at",
      customOnly = false,
      sortOrder = "desc",
    } = options

    const sb = [
      "created_at",
      "updated_at",
      "click_count",
      "short_code",
    ].includes(sortBy)
      ? sortBy
      : "created_at"

    const offset = (page - 1) * limit
    const queryParams = [!search, `%${search}%`, !customOnly, limit, offset]

    const [dataResult, totals] = await Promise.all([
      this.pool.query(
        `
          SELECT u.*,
            COALESCE(
              (SELECT array_agg(a.alias_code ORDER BY a.created_at)
               FROM url_aliases a
               WHERE a.url_id = u.id),
              '{}'
            ) AS aliases
          FROM urls u
          WHERE ($1 OR (u.original_url ILIKE $2 OR u.short_code ILIKE $2)) AND ($3 OR u.is_custom = TRUE)
          ORDER BY ${sb} ${sortOrder === "asc" ? "ASC" : "DESC"}
          LIMIT $4 OFFSET $5
        `,
        queryParams
      ),
      this.pool.query(
        `
          SELECT COUNT(*) FROM urls u
          WHERE ($1 OR (u.original_url ILIKE $2 OR u.short_code ILIKE $2)) AND ($3 OR u.is_custom = TRUE)
        `,
        queryParams.slice(0, 3)
      ),
    ])

    const total = parseInt(totals.rows[0].count, 10)
    const urls = URLRecords.parse(
      dataResult.rows.map((r) => ({ ...r, aliases: r.aliases ?? [] }))
    )

    return {
      urls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async updateUrl(
    shortCode: string,
    originalUrl: string
  ): Promise<UrlRecord | null> {
    const query = `
      UPDATE urls 
      SET original_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE short_code = $2
      RETURNING *
    `

    const result = await this.pool.query(query, [originalUrl, shortCode])
    if (!result.rows[0]) return null
    return this.attachAliases(result.rows[0])
  }

  async deleteUrl(shortCode: string): Promise<boolean> {
    const query = "DELETE FROM urls WHERE short_code = $1"
    const result = await this.pool.query(query, [shortCode])
    return (result.rowCount ?? 0) > 0
  }

  async incrementClickCount(shortCode: string): Promise<void> {
    // Increment on the primary url, even if shortCode is an alias
    const query = `
      UPDATE urls 
      SET click_count = click_count + 1 
      WHERE short_code = $1
        OR id = (SELECT url_id FROM url_aliases WHERE alias_code = $1 LIMIT 1)
    `
    await this.pool.query(query, [shortCode])
  }

  // ── Alias methods ──────────────────────────────────────────────────────────

  async addAlias(urlId: number, aliasCode: string): Promise<void> {
    // Reject if the alias_code is already used as a primary short_code
    const inUrls = await this.pool.query(
      "SELECT 1 FROM urls WHERE short_code = $1",
      [aliasCode]
    )
    if (inUrls.rows.length > 0) {
      throw new Error(
        `"${aliasCode}" is already used as a primary short code.`
      )
    }
    // Reject if already used as another alias
    const inAliases = await this.pool.query(
      "SELECT 1 FROM url_aliases WHERE alias_code = $1",
      [aliasCode]
    )
    if (inAliases.rows.length > 0) {
      throw new Error(`Alias "${aliasCode}" already exists.`)
    }

    await this.pool.query(
      "INSERT INTO url_aliases (url_id, alias_code) VALUES ($1, $2)",
      [urlId, aliasCode]
    )
  }

  async removeAlias(urlId: number, aliasCode: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM url_aliases WHERE url_id = $1 AND alias_code = $2",
      [urlId, aliasCode]
    )
    return (result.rowCount ?? 0) > 0
  }

  async getAliasesForUrl(urlId: number): Promise<string[]> {
    const result = await this.pool.query(
      "SELECT alias_code FROM url_aliases WHERE url_id = $1 ORDER BY created_at",
      [urlId]
    )
    return result.rows.map((r: { alias_code: string }) => r.alias_code)
  }

  async getAliasRow(
    urlId: number,
    aliasCode: string
  ): Promise<{ id: number; url_id: number; alias_code: string; created_at: Date } | null> {
    const result = await this.pool.query(
      "SELECT * FROM url_aliases WHERE url_id = $1 AND alias_code = $2",
      [urlId, aliasCode]
    )
    return result.rows[0] ?? null
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async attachAliases(row: Record<string, unknown>): Promise<UrlRecord> {
    const aliases = await this.getAliasesForUrl(row.id as number)
    return URLRecord.parse({ ...row, aliases })
  }
}

export const urlService = new UrlService()
