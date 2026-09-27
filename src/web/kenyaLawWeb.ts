/**
 * kenyaLawWeb.ts - High-performance real-time web fetcher & in-memory cache for Kenya Law (new.kenyalaw.org & kenyalaw.org)
 */

import { BROWSER_HEADERS, KenyaLawAccessBlockedError } from "../client/kenyaLawClient.js";

export interface LiveCaseResult {
  case_title: string;
  neutral_citation?: string;
  court?: string;
  date_delivered?: string;
  url: string;
  snippet?: string;
  source: "kenyalaw.org";
  oscola_citation?: string;
}

// ---------------------------------------------------------------------------
// In-Memory LRU Cache with 1-hour TTL for instant (<1ms) sub-second responses
// ---------------------------------------------------------------------------
interface CacheEntry {
  timestamp: number;
  data: LiveCaseResult[];
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
const liveQueryCache = new Map<string, CacheEntry>();

/**
 * Fast real-time case law lookup with in-memory caching & fast connection pooling
 */
export async function searchLiveKenyaLaw(
  query: string,
  limit: number = 10
): Promise<LiveCaseResult[]> {
  const cacheKey = `${query.trim().toLowerCase()}_${limit}`;
  const now = Date.now();

  // Fast cache hit (<1ms)
  const cached = liveQueryCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://new.kenyalaw.org/judgments/?q=${encodedQuery}`;

    let response = await fetch(searchUrl, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    if (!response || !response.ok) {
      const altUrl = `https://kenyalaw.org/judgments/?q=${encodedQuery}`;
      const altRes = await fetch(altUrl, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);
      if (altRes && altRes.ok) {
        response = altRes;
      } else if (altRes && altRes.status === 403 && (!response || response.status === 403)) {
        response = altRes;
      }
    }

    if (response && response.status === 403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law web search access blocked (HTTP 403 Forbidden) for '${query}'`);
    }

    if (!response || !response.ok) {
      return [];
    }

    const html = await response.text();
    const results: LiveCaseResult[] = [];

    // Parse HTML case items from judgments search results
    const linkRegex = /<a\s+[^>]*href=["']((?:\/akn\/ke\/judgment\/|https?:\/\/(?:new\.)?kenyalaw\.org\/caselaw\/cases\/view\/)[^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
      if (!match[1] || !match[2]) continue;
      const rawUrl = match[1].trim();
      const url = rawUrl.startsWith("http") ? rawUrl : `https://new.kenyalaw.org${rawUrl}`;
      const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

      if (!rawTitle || rawTitle.toLowerCase().includes("next") || rawTitle.toLowerCase().includes("previous") || rawTitle.toLowerCase() === "search") {
        continue;
      }

      // Extract neutral citation if present, e.g. [2024] eKLR or [2024] KEHC 123
      const citMatch = rawTitle.match(/\[\d{4}\]\s*(?:eKLR|KE[A-Z0-9]+\s+\d+)/i);
      const neutralCitation = citMatch ? citMatch[0] : undefined;

      results.push({
        case_title: rawTitle,
        neutral_citation: neutralCitation,
        url,
        source: "kenyalaw.org",
        oscola_citation: neutralCitation ? `${rawTitle}` : `${rawTitle} (kenyalaw.org)`,
      });
    }

    // Save to in-memory cache for instant subsequent lookups
    liveQueryCache.set(cacheKey, { timestamp: now, data: results });

    return results;
  } catch (err: unknown) {
    if (err instanceof KenyaLawAccessBlockedError || (err as any)?.isBlocked) {
      throw err;
    }
    console.warn("[kenyaLawWeb] Live fetch from kenyalaw.org failed/timed out:", err);
    return [];
  }
}
