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
    aliases?: string[],
    tags?: string[]
  ): Promise<UrlRecord> {
    let shortCode: string
    let isCustom = true

    if (customShortCode) {
      const existingUrl = await this.getUrlByShortCode(customShortCode)
      if (existingUrl) {
        throw new Error(
          "Short code already exists. Please choose a different one."
        )
      }
      shortCode = customShortCode
    } else {
      shortCode = nanoid(8)
      isCustom = false
    }

    const result = await this.pool.query(
      `INSERT INTO urls (original_url, short_code, is_custom)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [originalUrl, shortCode, isCustom]
    )
    const urlRecord = result.rows[0]

    for (const alias of aliases ?? []) {
      await this.addAlias(urlRecord.id, alias)
    }
    for (const tag of tags ?? []) {
      await this.addTag(urlRecord.id, tag)
    }

    return this.attachMetadata(urlRecord)
  }

  /** Looks up a URL by its primary short_code OR an alias code */
  async getUrlByShortCode(shortCode: string): Promise<UrlRecord | null> {
    const result = await this.pool.query(
      `SELECT u.*,
         ${this.tagsSubquery("u.id")} AS tags,
         ${this.aliasesSubquery("u.id")} AS aliases
       FROM urls u
       WHERE u.short_code = $1
          OR u.id = (SELECT url_id FROM url_aliases WHERE alias_code = $1 LIMIT 1)
       LIMIT 1`,
      [shortCode]
    )
    if (!result.rows[0]) return null
    return this.parseRow(result.rows[0])
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
      tag,
    } = options

    const sb = ["created_at", "updated_at", "click_count", "short_code"].includes(sortBy)
      ? sortBy
      : "created_at"

    const offset = (page - 1) * limit
    // $1 = no-search flag, $2 = search pattern,
    // $3 = no-starred flag, $4 = tag filter (null = all), $5 = limit, $6 = offset
    const params = [!search, `%${search}%`, !customOnly, tag ?? null, limit, offset]

    const where = `
      ($1 OR (u.original_url ILIKE $2 OR u.short_code ILIKE $2))
      AND ($3 OR u.is_starred = TRUE)
      AND ($4::text IS NULL OR EXISTS (
            SELECT 1 FROM url_tags WHERE url_id = u.id AND tag_name = $4
          ))`

    const [data, counts] = await Promise.all([
      this.pool.query(
        `SELECT u.*,
           ${this.tagsSubquery("u.id")} AS tags,
           ${this.aliasesSubquery("u.id")} AS aliases
         FROM urls u
         WHERE ${where}
         ORDER BY ${sb} ${sortOrder === "asc" ? "ASC" : "DESC"}
         LIMIT $5 OFFSET $6`,
        params
      ),
      this.pool.query(
        `SELECT COUNT(*) FROM urls u WHERE ${where}`,
        params.slice(0, 4)
      ),
    ])

    const total = parseInt(counts.rows[0].count, 10)
    const urls = URLRecords.parse(data.rows.map((r) => this.normaliseRow(r)))

    return {
      urls,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  }

  async updateUrl(shortCode: string, originalUrl: string): Promise<UrlRecord | null> {
    const result = await this.pool.query(
      `UPDATE urls
       SET original_url = $1, updated_at = CURRENT_TIMESTAMP
       WHERE short_code = $2
       RETURNING *`,
      [originalUrl, shortCode]
    )
    if (!result.rows[0]) return null
    return this.attachMetadata(result.rows[0])
  }

  /** Partially update a URL — currently only is_starred */
  async patchUrl(
    shortCode: string,
    patch: { is_starred?: boolean }
  ): Promise<UrlRecord | null> {
    if (patch.is_starred === undefined) return this.getUrlByShortCode(shortCode)

    const result = await this.pool.query(
      `UPDATE urls
       SET is_starred = $1, updated_at = CURRENT_TIMESTAMP
       WHERE short_code = $2
       RETURNING *`,
      [patch.is_starred, shortCode]
    )
    if (!result.rows[0]) return null
    return this.attachMetadata(result.rows[0])
  }

  async deleteUrl(shortCode: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM urls WHERE short_code = $1",
      [shortCode]
    )
    return (result.rowCount ?? 0) > 0
  }

  async incrementClickCount(shortCode: string): Promise<void> {
    await this.pool.query(
      `UPDATE urls
       SET click_count = click_count + 1
       WHERE short_code = $1
          OR id = (SELECT url_id FROM url_aliases WHERE alias_code = $1 LIMIT 1)`,
      [shortCode]
    )
  }

  /** Returns all distinct tag names in use, sorted */
  async getAllTags(): Promise<string[]> {
    const result = await this.pool.query(
      "SELECT DISTINCT tag_name FROM url_tags ORDER BY tag_name"
    )
    return result.rows.map((r: { tag_name: string }) => r.tag_name)
  }

  // ── Tag methods ────────────────────────────────────────────────────────────

  async addTag(urlId: number, tagName: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO url_tags (url_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [urlId, tagName.trim()]
    )
  }

  async removeTag(urlId: number, tagName: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM url_tags WHERE url_id = $1 AND tag_name = $2",
      [urlId, tagName]
    )
    return (result.rowCount ?? 0) > 0
  }

  async getTagsForUrl(urlId: number): Promise<string[]> {
    const result = await this.pool.query(
      "SELECT tag_name FROM url_tags WHERE url_id = $1 ORDER BY tag_name",
      [urlId]
    )
    return result.rows.map((r: { tag_name: string }) => r.tag_name)
  }

  // ── Alias methods ──────────────────────────────────────────────────────────

  async addAlias(urlId: number, aliasCode: string): Promise<void> {
    const inUrls = await this.pool.query(
      "SELECT 1 FROM urls WHERE short_code = $1",
      [aliasCode]
    )
    if (inUrls.rows.length > 0) {
      throw new Error(`"${aliasCode}" is already used as a primary short code.`)
    }
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

  // ── Private helpers ────────────────────────────────────────────────────────

  private tagsSubquery(ref: string) {
    return `COALESCE(
      (SELECT array_agg(t.tag_name ORDER BY t.tag_name)
       FROM url_tags t WHERE t.url_id = ${ref}),
      '{}')`
  }

  private aliasesSubquery(ref: string) {
    return `COALESCE(
      (SELECT array_agg(a.alias_code ORDER BY a.created_at)
       FROM url_aliases a WHERE a.url_id = ${ref}),
      '{}')`
  }

  private normaliseRow(row: Record<string, unknown>) {
    return {
      ...row,
      tags: row.tags ?? [],
      aliases: row.aliases ?? [],
    }
  }

  private parseRow(row: Record<string, unknown>): UrlRecord {
    return URLRecord.parse(this.normaliseRow(row))
  }

  private async attachMetadata(row: Record<string, unknown>): Promise<UrlRecord> {
    const id = row.id as number
    const [tags, aliases] = await Promise.all([
      this.getTagsForUrl(id),
      this.getAliasesForUrl(id),
    ])
    return URLRecord.parse({ ...row, tags, aliases })
  }
}

export const urlService = new UrlService()
