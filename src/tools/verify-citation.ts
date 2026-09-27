import { KenyaLawClient } from "../client/kenyaLawClient.js";
import { searchLiveKenyaLaw } from "../web/kenyaLawWeb.js";

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
  const query = String(
    args.citation_string ??
    args.citation ??
    args.query ??
    args.q ??
    args.akn_url ??
    args.url ??
    args.uri ??
    ""
  ).trim();

  if (!query) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required citation identifier. Pass 'citation_string' (or 'citation', 'query', 'akn_url') with a neutral citation or Akoma Ntoso URI.",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  let blockedError: string | undefined;

  // 1. Direct Akoma Ntoso URI/URL resolution if input contains AKN pattern
  if (query.includes("/akn/") || query.startsWith("http://") || query.startsWith("https://")) {
    try {
      const doc = await KenyaLawClient.getAknDocument(query);
      if (doc && doc.markdown) {
        if (doc.markdown.includes("Document Lookup Error")) {
          if (doc.markdown.includes("403") || doc.markdown.toLowerCase().includes("blocked")) {
            blockedError = `Kenya Law portal access blocked (HTTP 403 Forbidden) while retrieving '${query}'.`;
          }
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    verified: true,
                    type: doc.docType === "act" ? "statute" : "case_law",
                    citation_string: query,
                    matched_title: doc.title,
                    neutral_citation: doc.oscolaCitation || doc.title,
                    akn_url: doc.aknUrl || query,
                    url: query.startsWith("http") ? query : `https://kenyalaw.org${query.startsWith("/") ? "" : "/"}${query}`,
                    oscola_citation: doc.oscolaCitation,
                    message: `Successfully verified official Kenya Law record: ${doc.title}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }
    } catch (err: any) {
      if (err?.isBlocked || err?.message?.includes("403")) {
        blockedError = err.message || "Kenya Law portal access blocked (HTTP 403 Forbidden).";
      }
    }
  }

  const qLower = query.toLowerCase();

  // Try searching legislation first if query looks like Act/No/Cap
  if (/act|cap|no\./i.test(query)) {
    try {
      const statutes = await KenyaLawClient.searchLegislation(query, 3);
      const match = statutes.find(s => s.short_title.toLowerCase().includes(qLower) || s.akn_url.toLowerCase().includes(qLower));
      if (match) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                verified: true,
                type: "statute",
                citation_string: query,
                matched_title: match.short_title,
                akn_url: match.akn_url,
                url: match.url,
              }, null, 2),
            },
          ],
        };
      }
    } catch (err: any) {
      if (err?.isBlocked || err?.message?.includes("403") || err?.name === "KenyaLawAccessBlockedError") {
        blockedError = err.message || "Kenya Law legislation access blocked (HTTP 403 Forbidden).";
      }
    }
  }

  // Search case law
  let cases: any[] = [];
  try {
    cases = await KenyaLawClient.searchCaseLaw(query, undefined, undefined, 3);
  } catch (err: any) {
    if (err?.isBlocked || err?.message?.includes("403") || err?.name === "KenyaLawAccessBlockedError") {
      blockedError = err.message || "Kenya Law portal access blocked (HTTP 403 Forbidden).";
    } else {
      throw err;
    }
  }

  const caseMatch = cases.find(c => c.case_title.toLowerCase().includes(qLower) || c.akn_url.toLowerCase().includes(qLower) || (c.neutral_citation && c.neutral_citation.toLowerCase().includes(qLower)));
  if (caseMatch) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: true,
            type: "case_law",
            citation_string: query,
            matched_title: caseMatch.case_title,
            neutral_citation: caseMatch.neutral_citation,
            akn_url: caseMatch.akn_url,
            url: caseMatch.url,
            oscola_citation: caseMatch.oscola_citation,
          }, null, 2),
        },
      ],
    };
  }

  // Live website search fallback
  let liveResults: any[] = [];
  try {
    liveResults = await searchLiveKenyaLaw(query, 3);
  } catch (err: any) {
    if (err?.isBlocked || err?.message?.includes("403") || err?.name === "KenyaLawAccessBlockedError") {
      blockedError = err.message || "Kenya Law portal access blocked (HTTP 403 Forbidden).";
    }
  }
  const matchedLive = liveResults.find(
    (r) =>
      r.case_title.toLowerCase().includes(qLower) ||
      (r.neutral_citation && r.neutral_citation.toLowerCase().includes(qLower))
  );

  if (matchedLive) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              verified: true,
              type: "case_law",
              citation_string: query,
              matched_title: matchedLive.case_title,
              neutral_citation: matchedLive.neutral_citation,
              url: matchedLive.url,
              oscola_citation: matchedLive.oscola_citation,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (blockedError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: false,
            isBlocked: true,
            error: blockedError,
            citation_string: query,
            message: `Kenya Law portal access blocked (HTTP 403 Forbidden). Could not verify '${query}' against upstream portal.`,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          verified: false,
          citation_string: query,
          message: `Citation '${query}' could not be verified on Kenya Law. Check neutral citation format (e.g. '[2022] KESC 8').`,
        }, null, 2),
      },
    ],
    isError: true,
  };
}
