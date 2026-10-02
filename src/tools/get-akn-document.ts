import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  akn_url?: string;
  url?: string;
  uri?: string;
  akn_uri?: string;
  path?: string;
  link?: string;
  section?: string;
  article?: string;
  sec?: string;
  art?: string;
};

export async function getAknDocument(args: Args) {
  const aknUrl = String(
    args.akn_url ??
    args.url ??
    args.uri ??
    args.akn_uri ??
    args.path ??
    args.link ??
    ""
  ).trim();

  if (!aknUrl) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required AKN document identifier. Pass 'akn_url' (or 'url', 'uri', 'path') with a valid Kenya Law Akoma Ntoso URI or URL (e.g. '/akn/ke/judgment/kecot/2025/6/eng@2025-08-22' or 'https://kenyalaw.org/akn/ke/act/2010/constitution/eng@2010-09-03').",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  let doc: { title: string; markdown: string; aknUrl?: string; oscolaCitation?: string };
  try {
    doc = await KenyaLawClient.getAknDocument(aknUrl);
  } catch (err: any) {
    const isBlocked = Boolean(err?.isBlocked || err?.message?.includes("403") || err?.message?.includes("blocked"));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: err?.message || String(err),
            isBlocked,
            akn_url: aknUrl,
          }),
        },
      ],
      isError: true,
    };
  }

  const targetSection = String(args.section ?? args.article ?? args.sec ?? args.art ?? "").trim();
  if (targetSection && doc.markdown) {
    const num = targetSection.replace(/^(?:article|section|art\.|s\.)\s*/i, "").trim();
    if (!/^\d+[a-z]?$/i.test(num)) {
      return { content: [{ type: "text" as const, text: "Use a section or article number, such as 50 or 12A. Read its subsections from the returned provision." }], isError: true };
    }
    const numVal = Number(num);
    const nextBoundary = !isNaN(numVal)
      ? `(?:\\b${numVal + 1}\\.\\s+[A-Z]|(?:Article|Section)\\s+${numVal + 1}\\b|$)`
      : `(?:\\b\\d+\\.\\s+[A-Z]|(?:Article|Section)\\s+\\d+\\b|$)`;

    const sectionRegex = new RegExp(
      `(?:\\b(?:(?:Article|Section)\\s+${num}[\\.\\s]+|${num}\\.\\s+)[A-Z][\\s\\S]*?)(?=${nextBoundary})`,
      "i"
    );
    const match = doc.markdown.match(sectionRegex);
    if (match) {
      return {
        content: [
          {
            type: "text" as const,
            text: `# ${doc.title} - Section/Article ${num}\n\n**AKN URI**: ${aknUrl}\n\n---\n\n${match[0].trim()}`,
          },
        ],
      };
    }
    return { content: [{ type: "text" as const, text: `The document was retrieved, but section/article ${num} could not be located reliably. Retrieve the full document and inspect its headings before citing this provision.` }], isError: true };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: doc.markdown,
      },
    ],
  };
}
