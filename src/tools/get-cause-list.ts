import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  court_station: string;
  date?: string;
};

export async function getCauseList(args: Args) {
  if (!args.court_station || typeof args.court_station !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'court_station' parameter (e.g. 'Milimani Law Courts')." }),
        },
      ],
      isError: true,
    };
  }

  const results = await KenyaLawClient.getCauseList(args.court_station, args.date);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            court_station: args.court_station,
            date: args.date || new Date().toISOString().split("T")[0],
            count: results.length,
            cause_list: results,
          },
          null,
          2
        ),
      },
    ],
  };
}
