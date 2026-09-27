import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  query?: string;
  q?: string;
  search?: string;
  notice_number?: string;
  limit?: number;
};

export async function searchGazettes(args: Args) {
  const query = String(
    args.query ??
    args.q ??
    args.search ??
    args.notice_number ??
    ""
  ).trim();

  if (!query) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required query identifier for Gazette search. Pass 'query' (or 'q', 'search', 'notice_number').",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  const limit = Math.min(args.limit ?? 10, 50);
  const results = await KenyaLawClient.searchGazettes(query, limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query,
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
