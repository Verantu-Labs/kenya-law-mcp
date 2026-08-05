import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  query: string;
  court?: string;
  year_from?: number;
  limit?: number;
};

export async function searchCaseLaw(args: Args) {
  if (!args.query || typeof args.query !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'query' parameter." }),
        },
      ],
      isError: true,
    };
  }

  const limit = Math.min(args.limit ?? 10, 50);
  const results = await KenyaLawClient.searchCaseLaw(args.query, args.court, args.year_from, limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query: args.query,
            count: results.length,
            court_filter: args.court || "All Courts",
            results,
          },
          null,
          2
        ),
      },
    ],
  };
}
