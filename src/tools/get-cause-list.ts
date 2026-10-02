import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  court_station?: string;
  station?: string;
  court?: string;
  courtStation?: string;
  date?: string;
};

export async function getCauseList(args: Args) {
  const courtStation = String(
    args.court_station ??
    args.station ??
    args.court ??
    args.courtStation ??
    ""
  ).trim();

  if (!courtStation) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required court station identifier. Pass 'court_station' (or 'station', 'court') with a valid court station name (e.g. 'Milimani Law Courts' or 'High Court at Eldoret').",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const results = await KenyaLawClient.getCauseList(courtStation, args.date);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              court_station: courtStation,
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
  } catch (error: any) {
    return { content: [{ type: "text" as const, text: JSON.stringify({
      error: error?.message || String(error), isBlocked: Boolean(error?.isBlocked),
    }) }], isError: true };
  }
}
