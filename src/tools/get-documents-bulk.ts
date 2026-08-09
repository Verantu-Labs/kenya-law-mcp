import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  akn_urls: string[];
};

export async function getDocumentsBulk(args: Args) {
  if (!Array.isArray(args.akn_urls) || args.akn_urls.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Missing or invalid 'akn_urls' array parameter." }),
        },
      ],
      isError: true,
    };
  }

  const targetUrls = args.akn_urls.slice(0, 10);
  const docs = await Promise.all(
    targetUrls.map(async (url) => {
      const doc = await KenyaLawClient.getAknDocument(url);
      return {
        akn_url: url,
        title: doc.title,
        doc_type: doc.docType,
        oscola_citation: doc.oscolaCitation,
        markdown: doc.markdown,
      };
    })
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          requested_count: targetUrls.length,
          documents: docs,
        }, null, 2),
      },
    ],
  };
}
