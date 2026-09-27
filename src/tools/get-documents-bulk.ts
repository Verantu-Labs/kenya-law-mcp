import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  akn_urls?: string[];
  urls?: string[];
  uris?: string[];
};

export async function getDocumentsBulk(args: Args) {
  const urls = args.akn_urls ?? args.urls ?? args.uris;
  if (!Array.isArray(urls) || urls.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing or invalid 'akn_urls' array parameter. Pass 'akn_urls' (or 'urls') as an array of AKN document URIs or URLs.",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  const targetUrls = urls.slice(0, 10);
  const docs = await Promise.all(
    targetUrls.map(async (url) => {
      try {
        const doc = await KenyaLawClient.getAknDocument(url);
        return {
          akn_url: url,
          title: doc.title,
          doc_type: doc.docType,
          oscola_citation: doc.oscolaCitation,
          markdown: doc.markdown,
        };
      } catch (error: any) {
        return { akn_url: url, error: error?.message || String(error), isError: true };
      }
    })
  );

  return {
    ...(docs.some(doc => doc.isError) ? { isError: true } : {}),
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
