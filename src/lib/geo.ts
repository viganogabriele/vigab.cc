import { env } from "@/env"

/**
 * Country-level geolocation, privacy-by-design.
 *
 * We deliberately do NOT ship a GeoIP database and we NEVER send the visitor's
 * IP address to a third-party geolocation service. Instead we read a
 * country-only hint that a trusted upstream proxy/CDN (Cloudflare, Vercel, …)
 * already computed at the edge. This means the raw IP never has to leave the
 * server just to obtain a country, and we only ever learn the country — never
 * city, region, latitude/longitude, ISP or ASN.
 *
 * If no such header is present (e.g. running without a geo-aware proxy) the
 * country is reported as "Unknown". See `/privacy` and the README notes.
 */

/** Value stored when the country cannot be determined. */
export const UNKNOWN_COUNTRY = "Unknown"

// Headers commonly set by CDNs/proxies with an ISO 3166-1 alpha-2 country code.
const DEFAULT_COUNTRY_HEADERS = [
  "cf-ipcountry", // Cloudflare
  "x-vercel-ip-country", // Vercel
  "x-geo-country",
  "x-country-code",
]

// Sentinel values some proxies emit when they could not resolve a country.
const NON_COUNTRY_VALUES = new Set(["XX", "ZZ", "T1", "A1", "A2", "O1"])

interface HeaderGetter {
  get(name: string): string | null | undefined
}

/**
 * Resolve a country code (ISO 3166-1 alpha-2, uppercased) from request headers,
 * or {@link UNKNOWN_COUNTRY} when unavailable/invalid. Country-level only.
 */
export function getCountryFromHeaders(headers: HeaderGetter): string {
  const candidates = env.GEO_COUNTRY_HEADER
    ? [env.GEO_COUNTRY_HEADER, ...DEFAULT_COUNTRY_HEADERS]
    : DEFAULT_COUNTRY_HEADERS

  for (const name of candidates) {
    const raw = headers.get(name)
    if (!raw) continue
    const code = raw.trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(code) && !NON_COUNTRY_VALUES.has(code)) {
      return code
    }
  }
  return UNKNOWN_COUNTRY
}
