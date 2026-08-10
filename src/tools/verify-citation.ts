import { KenyaLawClient } from "../client/kenyaLawClient.js";
import { searchLiveKenyaLaw } from "../web/kenyaLawWeb.js";

type Args = {
  citation_string: string;
};

export async function verifyCitation(args: Args) {
  if (!args.citation_string || typeof args.citation_string !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'citation_string' parameter." }),
        },
      ],
      isError: true,
    };
  }

  const query = args.citation_string.trim();
  
  const qLower = query.toLowerCase();

  // Try searching legislation first if query looks like Act/No/Cap
  if (/act|cap|no\./i.test(query)) {
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
  }

  // Search case law
  const cases = await KenyaLawClient.searchCaseLaw(query, undefined, undefined, 3);
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
  const liveResults = await searchLiveKenyaLaw(query, 3);
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
