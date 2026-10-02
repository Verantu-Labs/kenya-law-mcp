/**
 * client/kenyaLawClient.ts - High-performance stateless HTTP client for Kenya Law (kenyalaw.org).
 * Resolves Akoma Ntoso (AKN) URIs, search queries, daily cause lists, and citator metadata.
 * Uses process-local one-hour caches and bounded network request timeouts.
 */

import { parseAknXml, type ParsedAknDocument } from "../akn/parser.js";

const BASE_URL = "https://kenyalaw.org";
const NEW_BASE_URL = "https://new.kenyalaw.org";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour TTL

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const documentCache = new Map<string, CacheEntry<ParsedAknDocument>>();
const queryCache = new Map<string, CacheEntry<any>>();

export class KenyaLawAccessBlockedError extends Error {
  readonly isBlocked = true;
  constructor(message: string = "Kenya Law portal access blocked (HTTP 403 Forbidden). Cannot search or retrieve case records.") {
    super(message);
    this.name = "KenyaLawAccessBlockedError";
  }
}

// Neutral citations encode an exact judgment identifier; this is identifier
// parsing, not keyword search or an inference that the record exists.
export function neutralCitationToAknPath(citation: string): string | undefined {
  const match = citation.trim().match(/^\[(\d{4})\]\s+(KE[A-Z0-9]+)\s+([1-9]\d*)$/i);
  return match ? `/akn/ke/judgment/${match[2]!.toLowerCase()}/${match[1]}/${match[3]}` : undefined;
}

// Validate every redirect before following it: an official initial URL alone
// does not prevent requests to private or unrelated hosts.
export function normalizeDocumentUrl(value: string): URL {
  const url = new URL(value, NEW_BASE_URL);
  if (url.protocol !== "https:" || !["kenyalaw.org", "new.kenyalaw.org"].includes(url.hostname)
    || url.port || url.username || url.password
    || !/^\/(?:akn\/ke\/|judgments\/)/.test(url.pathname)) {
    throw new Error("Document URLs must use HTTPS on kenyalaw.org or new.kenyalaw.org and an AKN or judgment-directory path.");
  }
  return url;
}

async function fetchDocument(url: string): Promise<Response> {
  let target = normalizeDocumentUrl(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(target.href, {
      headers: BROWSER_HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Kenya Law redirect has no Location header.");
    target = normalizeDocumentUrl(new URL(location, target).href);
  }
  throw new Error("Too many Kenya Law redirects.");
}

export interface CaseSearchResult {
  case_title: string;
  neutral_citation?: string;
  court?: string;
  court_level?: string;
  year?: number;
  akn_url: string;
  url: string;
  snippet?: string;
  source: "kenyalaw.org";
  oscola_citation: string;
}

export interface StatuteSearchResult {
  short_title: string;
  abbreviation?: string;
  year?: number;
  act_number?: string;
  akn_url: string;
  url: string;
  source: "kenyalaw.org";
}

export interface CauseListEntry {
  court_station: string;
  date: string;
  cause_number: string;
  parties: string;
  presiding_judge_coram?: string;
  hearing_type?: string;
  time?: string;
  source_url: string;
}

export interface CitatorResult {
  case_akn_url: string;
  neutral_citation: string;
  case_title: string;
  verified: boolean;
  status: "good_law" | "overruled" | "distinguished" | "doubted" | "not_found" | "not_checked";
  treatment_note?: string;
  citing_cases: Array<{
    citation: string;
    treatment: "followed" | "distinguished" | "overruled" | "referred_to";
    akn_url?: string;
  }>;
}

export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
};

export const COURT_SLUGS = {
  // Superior Courts
  supreme: { slug: "supreme-court", code: "kesc", name: "Supreme Court of Kenya" },
  supremem: { slug: "supreme-court", code: "kesc", name: "Supreme Court of Kenya" },
  kesc: { slug: "supreme-court", code: "kesc", name: "Supreme Court of Kenya" },
  scok: { slug: "supreme-court", code: "kesc", name: "Supreme Court of Kenya" },

  appeal: { slug: "court-of-appeal", code: "keca", name: "Court of Appeal of Kenya" },
  keca: { slug: "court-of-appeal", code: "keca", name: "Court of Appeal of Kenya" },
  coak: { slug: "court-of-appeal", code: "keca", name: "Court of Appeal of Kenya" },

  high: { slug: "high-court", code: "kehc", name: "High Court of Kenya" },
  kehc: { slug: "high-court", code: "kehc", name: "High Court of Kenya" },
  hck: { slug: "high-court", code: "kehc", name: "High Court of Kenya" },

  land: { slug: "environment-and-land-court", code: "keelc", name: "Environment and Land Court" },
  elc: { slug: "environment-and-land-court", code: "keelc", name: "Environment and Land Court" },
  keelc: { slug: "environment-and-land-court", code: "keelc", name: "Environment and Land Court" },

  labour: { slug: "employment-and-labour-relations-court", code: "keelrc", name: "Employment & Labour Relations Court" },
  labor: { slug: "employment-and-labour-relations-court", code: "keelrc", name: "Employment & Labour Relations Court" },
  elrc: { slug: "employment-and-labour-relations-court", code: "keelrc", name: "Employment & Labour Relations Court" },
  keelrc: { slug: "employment-and-labour-relations-court", code: "keelrc", name: "Employment & Labour Relations Court" },
  industrial: { slug: "industrial-court", code: "keic", name: "Industrial Court of Kenya" },
  keic: { slug: "industrial-court", code: "keic", name: "Industrial Court of Kenya" },

  // Subordinate Courts
  magistrate: { slug: "magistrates-court", code: "kemc", name: "Magistrate's Court" },
  magistrates: { slug: "magistrates-court", code: "kemc", name: "Magistrate's Court" },
  kemc: { slug: "magistrates-court", code: "kemc", name: "Magistrate's Court" },

  kadhi: { slug: "kadhis-court", code: "kekc", name: "Kadhis Court" },
  kadhis: { slug: "kadhis-court", code: "kekc", name: "Kadhis Court" },
  kekc: { slug: "kadhis-court", code: "kekc", name: "Kadhis Court" },

  small: { slug: "small-claims-court", code: "scc", name: "Small Claims Court" },
  claims: { slug: "small-claims-court", code: "scc", name: "Small Claims Court" },
  scc: { slug: "small-claims-court", code: "scc", name: "Small Claims Court" },

  // Specialized Tribunals
  copyright: { slug: "copyright-tribunal", code: "kecot", name: "Copyright Tribunal" },
  kecot: { slug: "copyright-tribunal", code: "kecot", name: "Copyright Tribunal" },

  environment: { slug: "national-environment-tribunal", code: "kenet", name: "National Environment Tribunal" },
  kenet: { slug: "national-environment-tribunal", code: "kenet", name: "National Environment Tribunal" },
  net: { slug: "national-environment-tribunal", code: "kenet", name: "National Environment Tribunal" },

  tax: { slug: "tax-appeals-tribunal", code: "ketr", name: "Tax Appeals Tribunal" },
  ketr: { slug: "tax-appeals-tribunal", code: "ketr", name: "Tax Appeals Tribunal" },
  tat: { slug: "tax-appeals-tribunal", code: "ketr", name: "Tax Appeals Tribunal" },

  procurement: { slug: "public-procurement-administrative-review-board", code: "kepprb", name: "Public Procurement Administrative Review Board" },
  kepprb: { slug: "public-procurement-administrative-review-board", code: "kepprb", name: "Public Procurement Administrative Review Board" },
  pparb: { slug: "public-procurement-administrative-review-board", code: "kepprb", name: "Public Procurement Administrative Review Board" },

  cooperative: { slug: "co-operative-tribunal", code: "kecprt", name: "Co-operative Tribunal" },
  kecprt: { slug: "co-operative-tribunal", code: "kecprt", name: "Co-operative Tribunal" },

  // Regional & International Courts
  afchpr: { slug: "african-court-on-human-and-peoples-rights", code: "afchpr", name: "African Court on Human and Peoples' Rights" },
  eacj: { slug: "east-african-court-of-justice", code: "eacj", name: "East African Court of Justice" },
} satisfies Record<string, { slug: string; code: string; name: string }>;

function normalizeCourtStation(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/\b(?:high court|court of appeal|environment and land court|employment and labour relations court|law courts|court station|at)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function resolveCourtStation(station: string | undefined, courtCode = "KEHC"): Promise<string | undefined> {
  if (!station?.trim()) return undefined;
  const requested = station.trim();

  const code = courtCode.toUpperCase();
  const cacheKey = `stations_${code}`;
  const now = Date.now();
  const cached = queryCache.get(cacheKey);
  let stations = cached && now - cached.timestamp < CACHE_TTL_MS
    ? cached.data as Array<{ code: string; name: string }>
    : undefined;

  if (!stations) {
    let response = await fetch(`${NEW_BASE_URL}/judgments/${code}/`, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!response || !response.ok) {
      const altResponse = await fetch(`${BASE_URL}/judgments/${code}/`, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      if (altResponse && altResponse.ok) {
        response = altResponse;
      } else if (altResponse && altResponse.status === 403 && (!response || response.status === 403)) {
        response = altResponse;
      }
    }

    if (response && response.status === 403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law court directory access blocked (HTTP 403 Forbidden) for ${code}`);
    }
    if (!response || !response.ok) throw new Error(`Kenya Law station discovery failed: ${response ? `HTTP ${response.status}` : "network unavailable"}`);
    const html = await response.text();
    const stationPattern = new RegExp(`<a[^>]+href=["']/judgments/${code}/([^/"']+)/["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
    stations = [];
    let match: RegExpExecArray | null;
    while ((match = stationPattern.exec(html)) !== null) {
      if (!match[1] || !match[2]) continue;
      const name = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (name) stations.push({ code: match[1].toUpperCase(), name });
    }
    queryCache.set(cacheKey, { timestamp: now, data: stations });
  }

  const normalized = normalizeCourtStation(requested);
  return stations.find(
    (candidate) => candidate.code === requested.toUpperCase() || normalizeCourtStation(candidate.name) === normalized,
  )?.code;
}

export function resolveCourt(courtStr?: string) {
  if (!courtStr) return null;
  const lower = courtStr.toLowerCase().trim();
  for (const [key, value] of Object.entries(COURT_SLUGS)) {
    if (lower === key || lower.includes(key)) return value;
  }
  return null;
}

export function extractCourtAndYear(
  query: string,
  courtHint?: string,
  yearHint?: number
): {
  courtCode?: string;
  courtName?: string;
  year?: number;
  cleanKeywords: string[];
} {
  let courtCode: string | undefined;
  let courtName: string | undefined;
  let year: number | undefined;

  // 1. Direct directory URL match: /judgments/{COURT}/{YEAR}/
  const dirMatch = query.match(/\/judgments\/([A-Za-z0-9_-]+)(?:\/(\d{4}))?/i);
  if (dirMatch && dirMatch[1]) {
    const rawCode = dirMatch[1];
    const resolved = resolveCourt(rawCode);
    courtCode = resolved ? resolved.code.toUpperCase() : rawCode.toUpperCase();
    courtName = resolved ? resolved.name : `${courtCode} (Kenya)`;
    if (dirMatch[2]) {
      year = parseInt(dirMatch[2], 10);
    }
  }

  // 2. Year resolution from parameter hint or 4-digit token
  if (yearHint && yearHint >= 1950 && yearHint <= 2035) {
    year = yearHint;
  } else if (!year) {
    const yearMatch = query.match(/\b(19[6-9]\d|20[0-3]\d)\b/);
    if (yearMatch && yearMatch[1]) {
      year = parseInt(yearMatch[1], 10);
    }
  }

  // 3. Court resolution from parameter hint or query keywords
  if (!courtCode && courtHint) {
    const resolved = resolveCourt(courtHint);
    if (resolved) {
      courtCode = resolved.code.toUpperCase();
      courtName = resolved.name;
    }
  }

  if (!courtCode) {
    const lowerQuery = query.toLowerCase();
    for (const [key, value] of Object.entries(COURT_SLUGS)) {
      const regex = new RegExp(`\\b${key}\\b`, "i");
      if (regex.test(lowerQuery)) {
        courtCode = value.code.toUpperCase();
        courtName = value.name;
        break;
      }
    }
  }

  // 4. Clean keywords by removing recognized court words, years, and search boilerplate
  const stopWords = new Set([
    "list", "top", "cases", "case", "judgments", "judgment", "ruling", "rulings",
    "decisions", "decision", "in", "from", "the", "of", "for", "and", "or", "to",
    "court", "supremem", "supreme", "appeal", "high", "kenya", "eklr", "find",
    "search", "show", "give", "me", "latest", "recent", "all",
    ...(courtCode ? [courtCode.toLowerCase()] : [])
  ]);

  const rawTokens = query
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w) && !/^\d{4}$/.test(w));

  return {
    courtCode,
    courtName,
    year,
    cleanKeywords: rawTokens,
  };
}

function extractMonth(query: string): number | undefined {
  const match = query.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (!match?.[1]) return undefined;
  return new Date(`${match[1]} 1, 2020`).getMonth() + 1;
}

async function extractWordDocumentXml(bytes: Uint8Array): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset++;
      continue;
    }
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;

    if (name === "word/document.xml") {
      const slice = bytes.subarray(dataStart, dataStart + compSize);
      if (compMethod === 8) {
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          const decompressedText = new Response(ds.readable).text();
          await writer.write(slice as any);
          await writer.close();
          return await decompressedText;
        } catch {
          return null;
        }
      }
      if (compMethod === 0) {
        return decoder.decode(slice);
      }
      return null;
    }
    offset = dataStart + compSize;
  }
  return null;
}

function docxXmlToMarkdown(xml: string): string {
  return xml
    .replace(/<w:p[^>]*>/gi, "\n\n")
    .replace(/<w:br[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class KenyaLawClient {
  /**
   * Fetches an Akoma Ntoso document by AKN URI or URL.
   * Validates official HTTPS paths and redirects, extracts HTML/XML/DOCX text,
   * and throws when access or readable document content cannot be established.
   */
  static async getAknDocument(aknUri: string): Promise<ParsedAknDocument> {
    const documentUrl = normalizeDocumentUrl(aknUri);
    const cacheKey = documentUrl.href;
    const now = Date.now();
    const cached = documentCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // Handle Kenya Law judgment directory URLs (e.g. /judgments/KESC/2022/ or /judgments/KESC/)
    const dirMatch = aknUri.match(/\/judgments\/([A-Za-z0-9_-]+)(?:\/(\d{4}))?/i);
    if (dirMatch && dirMatch[1]) {
      const rawCourt = dirMatch[1];
      const resolvedCourt = resolveCourt(rawCourt);
      const courtCode = resolvedCourt ? resolvedCourt.code.toUpperCase() : rawCourt.toUpperCase();
      const courtName = resolvedCourt ? resolvedCourt.name : `${courtCode} (Kenya)`;
      const year = dirMatch[2] ? parseInt(dirMatch[2], 10) : undefined;

      if (year) {
        const cases = await KenyaLawClient.fetchCourtYearDirectory(courtCode, year, [], 50);
        let markdown = `# ${courtName} - ${year} Judgments Directory\n\n`;
        markdown += `Official case law directory retrieved from [kenyalaw.org](https://kenyalaw.org/judgments/${courtCode}/${year}/).\n\n`;
        markdown += `**Total Decisions Listed**: ${cases.length}\n\n`;
        markdown += `| # | Case Title | Neutral Citation | Decision Date | Akoma Ntoso Link |\n`;
        markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
        cases.forEach((c, idx) => {
          const dateMatch = c.case_title.match(/\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)/);
          const dateStr = dateMatch ? dateMatch[1] : `${year}`;
          markdown += `| ${idx + 1} | ${c.case_title} | \`${c.neutral_citation || "N/A"}\` | ${dateStr} | [${c.akn_url}](${c.url}) |\n`;
        });

        const parsed: ParsedAknDocument = {
          title: `${courtName} (${year}) - Judgments Directory`,
          docType: "judgment",
          aknUrl: aknUri,
          markdown,
          sectionsCount: cases.length,
        };
        documentCache.set(cacheKey, { timestamp: now, data: parsed });
        return parsed;
      } else {
        const years = await KenyaLawClient.fetchAvailableCourtYears(courtCode);
        let markdown = `# ${courtName} - Available Judgment Archives\n\n`;
        markdown += `Official court repository directory retrieved from [kenyalaw.org](https://kenyalaw.org/judgments/${courtCode}/).\n\n`;
        markdown += `Available Archive Years:\n\n`;
        years.forEach((y) => {
          markdown += `- [${courtName} (${y})](https://kenyalaw.org/judgments/${courtCode}/${y}/)\n`;
        });
        const parsed: ParsedAknDocument = {
          title: `${courtName} - Judgment Archives`,
          docType: "judgment",
          aknUrl: aknUri,
          markdown,
          sectionsCount: years.length,
        };
        documentCache.set(cacheKey, { timestamp: now, data: parsed });
        return parsed;
      }
    }

    const primaryUrl = documentUrl.href;
    const alternate = new URL(primaryUrl);
    alternate.hostname = alternate.hostname === "new.kenyalaw.org" ? "kenyalaw.org" : "new.kenyalaw.org";
    let failure: unknown = new Error("No readable Kenya Law document was returned.");
    for (const fullUrl of [primaryUrl, alternate.href]) {
      try {
        const response = await fetchDocument(fullUrl);
        if (response.status === 403) throw new KenyaLawAccessBlockedError();
        if (!response.ok) throw new Error(`HTTP ${response.status} when fetching Kenya Law document.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const text = new TextDecoder().decode(bytes);
        if (text.startsWith("%PDF-") || response.headers.get("content-type")?.includes("application/pdf")) {
          throw new Error("PDF text extraction is not supported. Retrieve an HTML, AKN XML or DOCX source.");
        }
        let parsed: ParsedAknDocument;
        if (bytes.length > 4 && new DataView(bytes.buffer).getUint32(0, true) === 0x04034b50) {
          const xml = await extractWordDocumentXml(bytes);
          const body = xml ? docxXmlToMarkdown(xml) : "";
          if (!body.trim()) throw new Error("DOCX source contains no readable document text.");
          parsed = {
            title: `Document ${aknUri}`,
            docType: documentUrl.pathname.includes("/judgment/") ? "judgment" : "act",
            aknUrl: aknUri,
            markdown: `# Document ${aknUri}\n\n---\n\n${body}`,
            sectionsCount: Math.max(1, body.split("\n\n").length),
          };
        } else {
          parsed = parseAknXml(text, aknUri);
          const needsFullText = parsed.docType === "unknown" || parsed.markdown.includes("Loading PDF")
            || parsed.markdown.includes("Do you want to load it") || parsed.markdown.length < 800;
          if (needsFullText && !documentUrl.pathname.endsWith("/source")) {
            const sourceUrl = new URL(fullUrl);
            sourceUrl.pathname = `${sourceUrl.pathname.replace(/\/$/, "")}/source`;
            const candidates = [sourceUrl.href];
            const attachment = text.match(/href="([^"]*\.docx[^"]*)"/i)?.[1];
            if (attachment) candidates.push(new URL(attachment.replace(/&amp;/g, "&"), fullUrl).href);
            for (const candidate of candidates) {
              try {
                const source = await fetchDocument(candidate);
                if (!source.ok) continue;
                const sourceBytes = new Uint8Array(await source.arrayBuffer());
                if (sourceBytes.length > 4 && new DataView(sourceBytes.buffer).getUint32(0, true) === 0x04034b50) {
                  const xml = await extractWordDocumentXml(sourceBytes);
                  const body = xml ? docxXmlToMarkdown(xml) : "";
                  if (!body.trim()) continue;
                  parsed = { ...parsed, docType: documentUrl.pathname.includes("/judgment/") ? "judgment" : "act",
                    markdown: `# ${parsed.title}\n\n**AKN URI**: ${aknUri}\n\n---\n\n${body}`,
                    sectionsCount: Math.max(1, body.split("\n\n").length) };
                  break;
                }
                const sourceParsed = parseAknXml(new TextDecoder().decode(sourceBytes), aknUri);
                if (sourceParsed.docType !== "unknown") {
                  parsed = sourceParsed;
                  break;
                }
              } catch {
                // Optional source failure cannot validate an unreadable primary document.
              }
            }
          }
        }
        if (parsed.docType === "unknown"
          || /Loading PDF|Do you want to load it/i.test(parsed.markdown)) {
          throw new Error("The response did not contain recognized, readable Kenya Law document text.");
        }
        documentCache.set(cacheKey, { timestamp: now, data: parsed });
        return parsed;
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  /**
   * Fetches available judgment years for a court from https://kenyalaw.org/judgments/{COURT_CODE}/.
   */
  static async fetchAvailableCourtYears(courtCode: string): Promise<number[]> {
    const code = courtCode.toUpperCase();
    const cacheKey = `years_${code}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    let res = await fetch(`https://kenyalaw.org/judgments/${code}/`, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (!res || !res.ok) {
      const altRes = await fetch(`${NEW_BASE_URL}/judgments/${code}/`, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (altRes && altRes.ok) {
        res = altRes;
      } else if (altRes && altRes.status === 403 && (!res || res.status === 403)) {
        res = altRes;
      }
    }

    if (res && res.status === 403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law court years access blocked (HTTP 403 Forbidden) for ${code}`);
    }
    if (!res || !res.ok) throw new Error(`Kenya Law request failed: ${res ? `HTTP ${res.status}` : "network unavailable"}`);

    const html = await res.text();
    const yearMatches = [...html.matchAll(new RegExp(`/judgments/${code}/(\\d{4})/`, "gi"))];
    const years = Array.from(
      new Set(
        yearMatches
          .map((m) => (m[1] ? parseInt(m[1], 10) : NaN))
          .filter((y) => !isNaN(y))
      )
    ).sort((a, b) => b - a);
    queryCache.set(cacheKey, { timestamp: now, data: years });
    return years;
  }

  /**
   * Authoritative retrieval directly from Kenya Law's structured court/year directory:
   * https://kenyalaw.org/judgments/{COURT_CODE}/{YEAR}/
   * Automatically parses server-rendered Akoma Ntoso judgment links with pagination.
   */
  static async fetchCourtYearDirectory(
    courtCode: string,
    year: number,
    keywords: string[] = [],
    limit: number = 10,
    stationCode?: string,
    month?: number,
  ): Promise<CaseSearchResult[]> {
    const code = courtCode.toUpperCase();
    const cacheKey = `dir_${code}_${stationCode ?? "all"}_${year}_${month ?? "all"}_${keywords.join("_")}_${limit}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const resolved = resolveCourt(code);
    const courtName = resolved ? resolved.name : `${code} (Kenya)`;
    const results: CaseSearchResult[] = [];

    let blockedCount = 0;
    const fetchPage = async (pageUrl: string) => {
      try {
        const res = await fetch(pageUrl, {
          headers: BROWSER_HEADERS,
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 403) {
          blockedCount++;
          return null;
        }
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    };

    const directorySuffix = stationCode
      ? `${stationCode}/${year}${month ? `/${month}` : ""}/`
      : `${year}/`;
    const baseUrl = `https://kenyalaw.org/judgments/${code}/${directorySuffix}`;
    let html = await fetchPage(baseUrl);
    if (!html) {
      html = await fetchPage(`https://new.kenyalaw.org/judgments/${code}/${directorySuffix}`);
    }

    if (!html) {
      if (blockedCount >= 2) {
        throw new KenyaLawAccessBlockedError(`Kenya Law directory access blocked (HTTP 403 Forbidden) for ${code}/${directorySuffix}`);
      }
      throw new Error("Kenya Law directory could not be retrieved.");
    }

    const parseDecisions = (pageHtml: string) => {
      const linkRegex = /<a[^>]+href=["'](\/akn\/ke\/judgment\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(pageHtml)) !== null) {
        if (!match[1] || !match[2]) continue;
        const aknPath = match[1].trim();
        const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

        if (
          !rawTitle ||
          rawTitle.toLowerCase().includes("next") ||
          rawTitle.toLowerCase().includes("previous") ||
          rawTitle.toLowerCase() === "search" ||
          rawTitle.toLowerCase() === "skip to document content"
        ) {
          continue;
        }

        const citMatch = rawTitle.match(/\[\d{4}\]\s*(?:eKLR|KE[A-Z0-9]+\s+\d+)/i);
        const neutralCitation = citMatch ? citMatch[0] : undefined;

        results.push({
          case_title: rawTitle,
          neutral_citation: neutralCitation,
          court: courtName,
          year,
          akn_url: aknPath,
          url: `https://kenyalaw.org${aknPath}`,
          source: "kenyalaw.org",
          oscola_citation: neutralCitation ? `${rawTitle}` : `${rawTitle} (Kenya Law)`,
        });
      }
    };

    parseDecisions(html);

    // If more results requested and pagination exists, check page 2
    if (results.length < limit && html.includes("?page=2")) {
      const page2Html = await fetchPage(`${baseUrl}?page=2`);
      if (!page2Html) throw new Error("Kenya Law directory page 2 could not be retrieved; results are incomplete.");
      parseDecisions(page2Html);
    }

    // Filter or rank by keywords if specified
    if (keywords.length > 0) {
      const scored = results.map((item) => {
        const text = (item.case_title + " " + item.akn_url).toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw)) score += 10;
        }
        if (item.case_title.toLowerCase().includes("(judgment)")) score += 1;
        return { item, score };
      });

      const matches = scored.filter((s) => s.score > 1);
      if (matches.length > 0) {
        matches.sort((a, b) => b.score - a.score);
        const finalResults = matches.map((m) => m.item).slice(0, limit);
        queryCache.set(cacheKey, { timestamp: now, data: finalResults });
        return finalResults;
      }
    }

    const finalResults = results.slice(0, limit);
    queryCache.set(cacheKey, { timestamp: now, data: finalResults });
    return finalResults;
  }

  /**
   * Query-matched Atom RSS feed fallback from new.kenyalaw.org/feeds/judgments.xml & all.xml.
   */
  private static async searchAtomFeedFallback(feedType: "judgments" | "all", query: string, limit: number = 10): Promise<Array<{ title: string; url: string; aknPath: string }>> {
    const feedUrl = `${NEW_BASE_URL}/feeds/${feedType}.xml`;
    let response = await fetch(feedUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (!response || !response.ok) {
      const altResponse = await fetch(`${BASE_URL}/feeds/${feedType}.xml`, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (altResponse && altResponse.ok) {
        response = altResponse;
      } else if (altResponse && altResponse.status === 403 && (!response || response.status === 403)) {
        response = altResponse;
      }
    }

    if (!response || !response.ok) {
      if (response && response.status === 403) {
        throw new KenyaLawAccessBlockedError(`Kenya Law feeds access blocked (HTTP 403 Forbidden) for ${feedType}.xml`);
      }
      throw new Error(`Kenya Law feed failed: ${response ? `HTTP ${response.status}` : "network unavailable"}`);
    }

    const xml = await response.text();
    const results: Array<{ title: string; url: string; aknPath: string }> = [];
    const entryBlocks = xml.split("<entry>").slice(1);
    const qLower = query.toLowerCase();

    for (const block of entryBlocks) {
      if (results.length >= limit) break;

      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const rawTitle = titleMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        const rawUrl = linkMatch[1].trim();

        if (qLower === "" || rawTitle.toLowerCase().includes(qLower) || rawUrl.toLowerCase().includes(qLower)) {
          try {
            const urlObj = new URL(rawUrl);
            results.push({
              title: rawTitle,
              url: rawUrl,
              aknPath: urlObj.pathname,
            });
          } catch (_) {}
        }
      }
    }

    return results;
  }

  /**
   * Performs real-time search across Kenya Law cases using progressive fallback:
   * 1. Specialized court endpoint (if court filter was requested)
   * 2. General judgments search (if specialized search returns 0 results or no court specified)
   * 3. Atom RSS fallback (if direct search returns 0 results or times out)
   */
  static async searchCaseLaw(
    query: string,
    court?: string,
    yearFrom?: number,
    limit: number = 10,
    courtStation?: string,
    month?: number,
  ): Promise<CaseSearchResult[]> {
    const cacheKey = `cases_${query}_${court || ""}_${yearFrom || ""}_${limit}_${courtStation || ""}_${month || ""}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const encodedQuery = encodeURIComponent(query);
    const courtInfo = resolveCourt(court);
    const results: CaseSearchResult[] = [];

    const qWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);

    // Helper function to extract search results from HTML
    const parseHtmlResults = (html: string, enforceCourtCode?: string, requireKeywordMatch: boolean = true) => {
      const linkRegex = /<a\s+[^>]*href=["']((?:\/akn\/ke\/judgment\/|\/akn\/ke\/act\/|https?:\/\/kenyalaw\.org\/caselaw\/cases\/view\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
        if (!match[1] || !match[2]) continue;
        const rawLink = match[1].trim();
        const aknPath = rawLink.startsWith("http") ? new URL(rawLink).pathname : rawLink;
        const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

        if (!rawTitle || rawTitle.toLowerCase().includes("next") || rawTitle.toLowerCase().includes("previous") || rawTitle.toLowerCase() === "search" || rawTitle.toLowerCase() === "home") {
          continue;
        }

        if (enforceCourtCode && !aknPath.includes(`/${enforceCourtCode}/`)) {
          continue;
        }

        // Ensure extracted link is relevant to the search query
        if (requireKeywordMatch && qWords.length > 0) {
          const titleLower = rawTitle.toLowerCase();
          const aknLower = aknPath.toLowerCase();
          const isMatch = qWords.some(w => titleLower.includes(w) || aknLower.includes(w));
          if (!isMatch) {
            continue;
          }
        }

        const citMatch = rawTitle.match(/\[\d{4}\]\s*(?:eKLR|KE[A-Z0-9]+\s+\d+)/i);
        const neutralCitation = citMatch ? citMatch[0] : undefined;
        const yearMatch = rawTitle.match(/\[(\d{4})\]/);
        const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : yearFrom || new Date().getFullYear();

        // Infer court name from AKN path if available
        let inferredCourt = courtInfo ? courtInfo.name : (court || "Kenya Courts");
        if (aknPath.includes("/kesc/")) inferredCourt = "Supreme Court of Kenya";
        else if (aknPath.includes("/keca/")) inferredCourt = "Court of Appeal of Kenya";
        else if (aknPath.includes("/kehc/")) inferredCourt = "High Court of Kenya";
        else if (aknPath.includes("/keelc/")) inferredCourt = "Environment and Land Court";
        else if (aknPath.includes("/keelrc/")) inferredCourt = "Employment & Labour Relations Court";

        results.push({
          case_title: rawTitle,
          neutral_citation: neutralCitation,
          court: inferredCourt,
          year,
          akn_url: aknPath,
          url: aknPath.startsWith("http") ? aknPath : `${NEW_BASE_URL}${aknPath}`,
          source: "kenyalaw.org",
          oscola_citation: neutralCitation ? `${rawTitle}` : `${rawTitle} (Kenya Law)`,
        });
      }
    };

    // Tier 0: Authoritative Court and Year Directory Search
    const extracted = extractCourtAndYear(query, court, yearFrom);
    const requestedMonth = month ?? extractMonth(query);
    const directoryCourtCode = extracted.courtCode ?? (courtStation ? "KEHC" : undefined);
    const stationCode = courtStation
      ? await resolveCourtStation(courtStation, directoryCourtCode ?? "KEHC")
      : undefined;
    if (courtStation && !stationCode) {
      queryCache.set(cacheKey, { timestamp: now, data: [] });
      return [];
    }
    if (directoryCourtCode && extracted.year) {
      const dirCases = await KenyaLawClient.fetchCourtYearDirectory(
        directoryCourtCode,
        extracted.year,
        extracted.cleanKeywords,
        limit,
        stationCode,
        requestedMonth,
      );
      if (dirCases.length > 0) {
        queryCache.set(cacheKey, { timestamp: now, data: dirCases });
        return dirCases;
      }
    } else if (extracted.courtCode && !extracted.year) {
      const availableYears = await KenyaLawClient.fetchAvailableCourtYears(extracted.courtCode);
      const targetYear = availableYears[0];
      if (targetYear !== undefined) {
        const dirCases = await KenyaLawClient.fetchCourtYearDirectory(
          extracted.courtCode,
          targetYear,
          extracted.cleanKeywords,
          limit
        );
        if (dirCases.length > 0) {
          queryCache.set(cacheKey, { timestamp: now, data: dirCases });
          return dirCases;
        }
      }
    }

    let encountered403 = false;
    let upstreamFailure: Error | undefined;

    // Tier 1: Try unified search endpoint /search/?q=... first
    let unifiedUrl = `${NEW_BASE_URL}/search/?q=${encodedQuery}`;
    if (court) unifiedUrl += `&court=${encodeURIComponent(court)}`;
    if (yearFrom) unifiedUrl += `&year=${yearFrom}`;

    let res = await fetch(unifiedUrl, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (res && res.status === 403) {
      encountered403 = true;
    } else if (res && res.ok) {
      const html = await res.text();
      parseHtmlResults(html, courtInfo ? courtInfo.code : undefined, true);
    } else {
      upstreamFailure = new Error(`Kenya Law search failed: ${res ? `HTTP ${res.status}` : "network unavailable"}`);
    }

    // Tier 2: Try /judgments/?q=...
    if (results.length === 0) {
      let genUrl = `${NEW_BASE_URL}/judgments/?q=${encodedQuery}`;
      if (court) genUrl += `&court=${encodeURIComponent(court)}`;
      if (yearFrom) genUrl += `&year=${yearFrom}`;

      res = await fetch(genUrl, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);

      if (res && res.status === 403) {
        encountered403 = true;
      } else if (res && res.ok) {
        const html = await res.text();
        parseHtmlResults(html, courtInfo ? courtInfo.code : undefined, true);
      } else {
        upstreamFailure = new Error(`Kenya Law search failed: ${res ? `HTTP ${res.status}` : "network unavailable"}`);
      }
    }

    // Tier 3: Atom Feed & Live Search Fallback if direct search returned 0 results
    if (results.length === 0) {
      try {
        const fallbacks = await KenyaLawClient.searchAtomFeedFallback("judgments", query, limit);
        const qWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);

        for (const item of fallbacks) {
          const itemLower = (item.title + " " + item.aknPath).toLowerCase();
          const matchesKeyword = qWords.some(w => itemLower.includes(w));

          if (matchesKeyword || qWords.length === 0) {
            let inferredCourt = courtInfo ? courtInfo.name : (court || "Kenya Courts");
            if (item.aknPath.includes("/kesc/")) inferredCourt = "Supreme Court of Kenya";
            else if (item.aknPath.includes("/keca/")) inferredCourt = "Court of Appeal of Kenya";
            else if (item.aknPath.includes("/kehc/")) inferredCourt = "High Court of Kenya";
            else if (item.aknPath.includes("/keelc/")) inferredCourt = "Environment and Land Court";
            else if (item.aknPath.includes("/keelrc/")) inferredCourt = "Employment & Labour Relations Court";

            results.push({
              case_title: item.title,
              neutral_citation: item.title.match(/\[\d{4}\][^)]+/)?.[0],
              court: inferredCourt,
              year: yearFrom || new Date().getFullYear(),
              akn_url: item.aknPath,
              url: item.url,
              source: "kenyalaw.org",
              oscola_citation: item.title,
            });
          }
        }

      } catch (feedErr) {
        if (feedErr instanceof KenyaLawAccessBlockedError || (feedErr as any)?.isBlocked) {
          encountered403 = true;
        } else {
          upstreamFailure = feedErr instanceof Error ? feedErr : new Error(String(feedErr));
        }
      }
    }

    if (results.length === 0 && encountered403) {
      throw new KenyaLawAccessBlockedError("Kenya Law portal access blocked (HTTP 403 Forbidden). Cannot search or retrieve case records.");
    }

    const qLower = query.toLowerCase().trim();
    if (qLower.length > 0) {
      results.sort((a, b) => {
        const aMatch = a.case_title.toLowerCase().includes(qLower) || a.akn_url.toLowerCase().includes(qLower);
        const bMatch = b.case_title.toLowerCase().includes(qLower) || b.akn_url.toLowerCase().includes(qLower);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    if (results.length === 0 && upstreamFailure) throw upstreamFailure;
    queryCache.set(cacheKey, { timestamp: now, data: results });
    return results;
  }

  /**
   * Searches revised Acts of Parliament and Legal Notices index (/akn/ke/act/).
   */
  static async searchLegislation(actName: string, limit: number = 10): Promise<StatuteSearchResult[]> {
    const cacheKey = `leg_${actName}_${limit}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const encodedQuery = encodeURIComponent(actName);
    const searchUrl = `${NEW_BASE_URL}/legislation/?q=${encodedQuery}`;

    let encountered403 = false;
    let upstreamFailure: Error | undefined;
    const response = await fetch(searchUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (response && response.status === 403) {
      encountered403 = true;
    }

    if (!response || (!response.ok && response.status !== 403)) {
      upstreamFailure = new Error(`Kenya Law legislation search failed: ${response ? `HTTP ${response.status}` : "network unavailable"}`);
    }
    const results: StatuteSearchResult[] = [];

    if (response && response.ok) {
      const html = await response.text();
      const linkRegex = /<a\s+[^>]*href=["'](\/akn\/ke\/act\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
        if (!match[1] || !match[2]) continue;
        const aknPath = match[1].trim();
        const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

        if (!rawTitle || rawTitle.toLowerCase() === "laws of kenya" || rawTitle.toLowerCase().includes("constitution of kenya")) {
          if (rawTitle.toLowerCase().includes("constitution of kenya") && !actName.toLowerCase().includes("constitution")) {
            continue;
          }
        }

        const yearMatch = aknPath.match(/\/act\/(\d{4})\//);
        const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : undefined;

        results.push({
          short_title: rawTitle,
          year,
          akn_url: aknPath,
          url: `${NEW_BASE_URL}${aknPath}`,
          source: "kenyalaw.org",
        });
      }
    }

    // If direct search was blocked (403) or returned zero results, use Atom RSS feed fallback
    if (results.length === 0) {
      try {
        const fallbacks = await KenyaLawClient.searchAtomFeedFallback("all", actName, limit);
        const actLower = actName.toLowerCase().trim();
        for (const item of fallbacks) {
          if (item.title.toLowerCase().includes(actLower) || item.aknPath.toLowerCase().includes(actLower)) {
            results.push({
              short_title: item.title,
              akn_url: item.aknPath,
              url: item.url,
              source: "kenyalaw.org",
            });
          }
        }
      } catch (feedErr) {
        if (feedErr instanceof KenyaLawAccessBlockedError || (feedErr as any)?.isBlocked) {
          encountered403 = true;
        } else {
          upstreamFailure = feedErr instanceof Error ? feedErr : new Error(String(feedErr));
        }
      }
    }

    if (results.length === 0 && encountered403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law legislation access blocked (HTTP 403 Forbidden) for '${actName}'`);
    }

    if (results.length === 0 && upstreamFailure) throw upstreamFailure;
    queryCache.set(cacheKey, { timestamp: now, data: results });
    return results;
  }

  /**
   * Retrieves daily court cause lists by court station and date.
   */
  static async getCauseList(courtStation: string, dateStr?: string): Promise<CauseListEntry[]> {
    const targetDate = dateStr || new Date().toISOString().split("T")[0];
    const cacheKey = `causelist_${courtStation}_${targetDate}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const encodedStation = encodeURIComponent(courtStation);
    const causeUrl = `${NEW_BASE_URL}/causelists/?q=${encodedStation}`;

    const response = await fetch(causeUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law cause list access blocked (HTTP 403 Forbidden) for station ${courtStation}`);
    }
    if (!response.ok) throw new Error(`Kenya Law request failed: HTTP ${response.status}`);

    const html = await response.text();
    const entries: CauseListEntry[] = [];

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match: RegExpExecArray | null;

    while ((match = rowRegex.exec(html)) !== null && entries.length < 20) {
      if (!match[1]) continue;
      const cells = match[1].split(/<td[^>]*>/i).map((c) => c.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
      if (cells.length >= 2) {
        entries.push({
          court_station: courtStation,
          date: targetDate || new Date().toISOString().split("T")[0]!,
          cause_number: cells[0] || "N/A",
          parties: cells[1] || "Unspecified Parties",
          presiding_judge_coram: cells[2] || undefined,
          hearing_type: cells[3] || "Mention / Hearing",
          time: cells[4] || "09:00 AM",
          source_url: causeUrl,
        });
      }
    }

    queryCache.set(cacheKey, { timestamp: now, data: entries });
    return entries;
  }

  /**
   * Retrieves case citator treatment by resolving the AKN document metadata.
   */
  static async checkCitator(caseAknUrl: string): Promise<CitatorResult> {
    const cacheKey = `citator_${caseAknUrl}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const citationPath = neutralCitationToAknPath(caseAknUrl);
    const doc = await KenyaLawClient.getAknDocument(citationPath ?? caseAknUrl);
    if (citationPath && ![doc.title, doc.oscolaCitation].some(value =>
      neutralCitationToAknPath(value?.match(/\[\d{4}\]\s+KE[A-Z0-9]+\s+[1-9]\d*/i)?.[0] ?? "") === citationPath)) {
      throw new Error("The retrieved judgment metadata does not confirm the requested neutral citation.");
    }
    if (doc.docType !== "judgment" || !doc.aknUrl?.includes("/akn/ke/judgment/")) {
      throw new Error("Citator checks require an individual judgment AKN identifier.");
    }

    const citResult: CitatorResult = {
      case_akn_url: caseAknUrl,
      neutral_citation: doc.oscolaCitation || caseAknUrl.replace(/^\/akn\/ke\/judgment\//, "").replace(/\//g, " "),
      case_title: doc.title,
      verified: true,
      status: "not_checked",
      treatment_note: "Official document found. Subsequent judicial treatment has not been retrieved; this does not establish that the decision remains good law.",
      citing_cases: [],
    };

    queryCache.set(cacheKey, { timestamp: now, data: citResult });
    return citResult;
  }

  /**
   * Real-time search across Kenya Gazette notices (land title notices, appointments, probate notices).
   */
  static async searchGazettes(query: string, limit: number = 10): Promise<Array<{ title: string; url: string; date?: string; source: string }>> {
    const cacheKey = `gazette_${query}_${limit}`;
    const now = Date.now();
    const cached = queryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const encodedQuery = encodeURIComponent(query);
    const gazetteUrl = `${BASE_URL}/kenyagazette/cases/search?search_words=${encodedQuery}`;

    const response = await fetch(gazetteUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 403) {
      throw new KenyaLawAccessBlockedError(`Kenya Law gazette access blocked (HTTP 403 Forbidden) for query '${query}'`);
    }
    if (!response.ok) throw new Error(`Kenya Law request failed: HTTP ${response.status}`);

    const html = await response.text();
    const results: Array<{ title: string; url: string; date?: string; source: string }> = [];

    const linkRegex = /<a\s+[^>]*href=["'](http:\/\/kenyalaw\.org\/kenyagazette\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
      if (!match[1] || !match[2]) continue;
      const url = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
      if (rawTitle && rawTitle.length > 5) {
        results.push({
          title: rawTitle,
          url,
          source: "kenyalaw.org/kenyagazette",
        });
      }
    }

    queryCache.set(cacheKey, { timestamp: now, data: results });
    return results;
  }

}
