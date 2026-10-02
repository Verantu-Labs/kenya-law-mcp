import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  query?: string;
  q?: string;
  search?: string;
  keywords?: string;
  citation?: string;
  court?: string;
  court_level?: string;
  court_code?: string;
  year?: number | string;
  year_from?: number | string;
  year_to?: number | string;
  limit?: number | string;
  court_station?: string;
  station?: string;
  month?: number | string;
  akn_url?: string;
  url?: string;
  uri?: string;
};

export async function searchCaseLaw(args: Args) {
  const court = args.court ?? args.court_level ?? args.court_code;
  const courtStation = args.court_station ?? args.station;
  const parsedYear = args.year ?? args.year_from;
  let yearFrom = parsedYear !== undefined ? parseInt(String(parsedYear), 10) : undefined;
  const aknUrl = args.akn_url ?? args.url ?? args.uri;

  let query = String(
    args.query ??
    args.q ??
    args.search ??
    args.keywords ??
    args.citation ??
    aknUrl ??
    ""
  ).trim();

  // Scenario 1: Direct AKN Document URL passed to search_case_law -> Resolve document directly
  if (query.includes("/akn/ke/") && !query.includes("/search/")) {
    const doc = await KenyaLawClient.getAknDocument(query);
    if (doc && !doc.markdown.includes("Document Lookup Error")) {
      const citMatch = doc.title.match(/\[\d{4}\]\s*(?:eKLR|KE[A-Z0-9]+\s+\d+)/i);
      const courtMatch = doc.title.match(/(?:Supreme Court|Court of Appeal|High Court|Environment and Land Court|Employment & Labour Relations Court|Tribunal)/i);
      const docAknUrl = doc.aknUrl ?? query;
      const singleResult = {
        case_title: doc.title,
        neutral_citation: citMatch ? citMatch[0] : doc.oscolaCitation,
        court: courtMatch ? courtMatch[0] : "Kenya Courts",
        akn_url: docAknUrl,
        url: docAknUrl.startsWith("http") ? docAknUrl : `https://kenyalaw.org${docAknUrl}`,
        source: "kenyalaw.org",
        oscola_citation: doc.oscolaCitation || doc.title,
      };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                total_results: 1,
                court_filter: "Direct Document Lookup",
                results: [singleResult],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  // Scenario 2: Kenya Law Search URL passed to search_case_law -> Unpack parameters and keywords
  if (query.includes("/search/") && (query.includes("date_from=") || query.includes("a=") || query.includes("q="))) {
    try {
      const u = new URL(query.startsWith("http") ? query : `https://kenyalaw.org${query}`);
      const extractedKeywords: string[] = [];
      const aRaw = u.searchParams.get("a");
      if (aRaw) {
        try {
          const a = JSON.parse(aRaw);
          for (const item of a) {
            if (item && item.text) extractedKeywords.push(String(item.text).trim());
          }
        } catch (_) {}
      }
      const qParam = u.searchParams.get("q");
      if (qParam) extractedKeywords.push(qParam.trim());

      const dateFrom = u.searchParams.get("date_from");
      const firstPart = dateFrom ? dateFrom.split("-")[0] : undefined;
      const urlYear = firstPart ? parseInt(firstPart, 10) : undefined;

      if (extractedKeywords.length > 0) {
        query = extractedKeywords.join(" ");
      }
      if (urlYear && !yearFrom && !isNaN(urlYear)) {
        yearFrom = urlYear;
      }
    } catch (_) {}
  }

  // If query text is omitted but court or year is passed, construct a search query
  if (!query && (court || yearFrom)) {
    query = `${court || ""} ${yearFrom || ""}`.trim();
  }

  if (!query) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required case law search parameters. Pass 'query' (e.g. 'Supreme Court 2022' or 'election petitions'), 'court', 'year', or a Kenya Law URL.",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  const rawLimit = args.limit !== undefined ? parseInt(String(args.limit), 10) : 10;
  const limit = Math.min(isNaN(rawLimit) ? 10 : rawLimit, 50);
  const month = args.month !== undefined ? parseInt(String(args.month), 10) : undefined;

  try {
    const results = await KenyaLawClient.searchCaseLaw(query, court, yearFrom, limit, courtStation, month);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              total_results: results.length,
              court_filter: court ?? courtStation ?? "All Courts",
              court,
              court_station: courtStation,
              year: yearFrom,
              month,
              results,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    const isBlocked = Boolean(
      err?.isBlocked ||
      err?.name === "KenyaLawAccessBlockedError" ||
      err?.message?.includes("403") ||
      err?.message?.includes("blocked")
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: err?.message || String(err),
            isBlocked,
            query,
            court_filter: court ?? courtStation ?? "All Courts",
            court,
            court_station: courtStation,
            year: yearFrom,
            month,
          }),
        },
      ],
      isError: true,
    };
  }
}
