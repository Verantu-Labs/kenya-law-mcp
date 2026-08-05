import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  query: string;
  limit?: number;
};

export async function searchGazettes(args: Args) {
  if (!args.query || typeof args.query !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'query' parameter for Gazette search." }),
        },
      ],
      isError: true,
    };
  }

  const limit = Math.min(args.limit ?? 10, 50);
  const results = await KenyaLawClient.searchGazettes(args.query, limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query: args.query,
            count: results.length,
            results,
          },
          null,
          2
        ),
      },
    ],
  };
}
