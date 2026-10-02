import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  act_name?: string;
  query?: string;
  act?: string;
  title?: string;
  name?: string;
  q?: string;
  limit?: number;
};

export async function searchLegislation(args: Args) {
  const actName = String(
    args.act_name ??
    args.query ??
    args.act ??
    args.title ??
    args.name ??
    args.q ??
    ""
  ).trim();

  if (!actName) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required statute identifier. Pass 'act_name' (or 'query', 'title', 'name') with a statute title (e.g. 'Employment Act' or 'Constitution of Kenya').",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  const limit = Math.min(args.limit ?? 10, 50);
  try {
    const results = await KenyaLawClient.searchLegislation(actName, limit);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              act_name: actName,
              count: results.length,
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
            act_name: actName,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
