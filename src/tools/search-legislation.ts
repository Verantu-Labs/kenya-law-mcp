import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  act_name: string;
  limit?: number;
};

export async function searchLegislation(args: Args) {
  if (!args.act_name || typeof args.act_name !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'act_name' parameter." }),
        },
      ],
      isError: true,
    };
  }

  const limit = Math.min(args.limit ?? 10, 50);
  const results = await KenyaLawClient.searchLegislation(args.act_name, limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            act_name: args.act_name,
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
