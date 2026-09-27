import { KenyaLawClient, normalizeDocumentUrl, neutralCitationToAknPath } from "../client/kenyaLawClient.js";

type Args = {
  citation_string?: string;
  citation?: string;
  query?: string;
  q?: string;
  akn_url?: string;
  url?: string;
  uri?: string;
};

export async function verifyCitation(args: Args) {
  const query = String(args.citation_string ?? args.citation ?? args.query ?? args.q ?? args.akn_url ?? args.url ?? args.uri ?? "").trim();
  try {
    if (!query) throw new Error("Missing required citation_string.");
    let identifier = neutralCitationToAknPath(query);
    if (query.startsWith("/") || /^https?:/i.test(query)) {
      const url = normalizeDocumentUrl(query);
      if (!url.pathname.startsWith("/akn/ke/")) throw new Error("A directory cannot verify an individual citation.");
      identifier = url.href;
    } else if (!identifier) {
      // Search results are discovery only; a matching record must also be readable.
      const normalized = query.toLowerCase().replace(/\s+/g, " ");
      if (/\b(?:act|cap|constitution)\b/i.test(query)) {
        const statutes = await KenyaLawClient.searchLegislation(query, 10);
        identifier = statutes.find(record => record.short_title.toLowerCase().replace(/\s+/g, " ") === normalized)?.akn_url;
      } else {
        const cases = await KenyaLawClient.searchCaseLaw(query, undefined, undefined, 10);
        identifier = cases.find(record => [record.case_title, record.neutral_citation].some(value =>
          value?.toLowerCase().replace(/\s+/g, " ") === normalized))?.akn_url;
      }
    }
    if (!identifier) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ verified: false, citation_string: query,
        message: "No exact matching record was found. This does not establish that the authority is absent." }) }], isError: true };
    }
    const doc = await KenyaLawClient.getAknDocument(identifier);
    if (doc.docType === "unknown") throw new Error("The record has no recognized document text.");
    if (!query.startsWith("/") && !/^https?:/i.test(query)) {
      const normalized = query.toLowerCase().replace(/\s+/g, " ");
      const identifiers = [doc.title, doc.oscolaCitation, doc.title.match(/\[\d{4}\]\s*KE[A-Z0-9]+\s+\d+/i)?.[0]];
      if (!identifiers.some(value => value?.toLowerCase().replace(/\s+/g, " ") === normalized)) {
        throw new Error("The retrieved document metadata does not confirm the requested citation.");
      }
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ verified: true,
      type: doc.docType === "act" ? "statute" : doc.docType === "judgment" ? "case_law" : "legal_notice",
      citation_string: query, matched_title: doc.title, neutral_citation: doc.oscolaCitation,
      akn_url: doc.aknUrl || identifier, url: normalizeDocumentUrl(identifier).href,
      oscola_citation: doc.oscolaCitation,
      message: "An official record was retrieved. Existence does not establish current validity or judicial treatment.",
    }, null, 2) }] };
  } catch (error: any) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ verified: false, citation_string: query,
      error: error?.message || String(error), isBlocked: Boolean(error?.isBlocked),
    }) }], isError: true };
  }
}
