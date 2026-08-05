import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  akn_url: string;
};

export async function getAknDocument(args: Args) {
  if (!args.akn_url || typeof args.akn_url !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'akn_url' parameter." }),
        },
      ],
      isError: true,
    };
  }

  const doc = await KenyaLawClient.getAknDocument(args.akn_url);

  return {
    content: [
      {
        type: "text" as const,
        text: doc.markdown,
      },
    ],
  };
}
