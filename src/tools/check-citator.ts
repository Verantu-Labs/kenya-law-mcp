import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  case_akn_url: string;
};

export async function checkCitator(args: Args) {
  if (!args.case_akn_url || typeof args.case_akn_url !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'case_akn_url' parameter." }),
        },
      ],
      isError: true,
    };
  }

  const citatorData = await KenyaLawClient.checkCitator(args.case_akn_url);

  const isError = !citatorData.verified || citatorData.status === "not_found";

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(citatorData, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}
