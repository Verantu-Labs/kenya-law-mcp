import { KenyaLawClient } from "../client/kenyaLawClient.js";

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
  
  // Try searching legislation first if query looks like Act/No/Cap
  if (/act|cap|no\./i.test(query)) {
    const statutes = await KenyaLawClient.searchLegislation(query, 3);
    if (statutes.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              verified: true,
              type: "statute",
              citation_string: query,
              matched_title: statutes[0].short_title,
              akn_url: statutes[0].akn_url,
              url: statutes[0].url,
            }, null, 2),
          },
        ],
      };
    }
  }

  // Search case law
  const cases = await KenyaLawClient.searchCaseLaw(query, undefined, undefined, 3);
  if (cases.length > 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: true,
            type: "case_law",
            citation_string: query,
            matched_title: cases[0].case_title,
            neutral_citation: cases[0].neutral_citation,
            akn_url: cases[0].akn_url,
            url: cases[0].url,
            oscola_citation: cases[0].oscola_citation,
          }, null, 2),
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
  };
}
