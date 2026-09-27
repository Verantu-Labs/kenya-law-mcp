import { KenyaLawClient } from "../client/kenyaLawClient.js";

type Args = {
  case_akn_url?: string;
  akn_url?: string;
  url?: string;
  uri?: string;
  citation?: string;
};

export async function checkCitator(args: Args) {
  const caseAknUrl = String(
    args.case_akn_url ??
    args.akn_url ??
    args.url ??
    args.uri ??
    args.citation ??
    ""
  ).trim();

  if (!caseAknUrl) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Missing required case identifier. Pass 'case_akn_url' (or 'akn_url', 'url', 'citation') with an Akoma Ntoso URI or neutral citation.",
            received_parameters: Object.keys(args),
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const citatorData = await KenyaLawClient.checkCitator(caseAknUrl);
    const isBlocked = (citatorData as any).status === "blocked" || Boolean((citatorData as any).treatment_note?.includes("403"));
    const isError = !citatorData.verified || citatorData.status === "not_found" || isBlocked;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ...citatorData,
              ...(isBlocked ? { isBlocked: true } : {}),
            },
            null,
            2
          ),
        },
      ],
      ...(isError ? { isError: true } : {}),
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
            verified: false,
            case_akn_url: caseAknUrl,
            error: err?.message || String(err),
            isBlocked,
            status: isBlocked ? "blocked" : "not_found",
            treatment_note: isBlocked ? "Kenya Law portal access blocked (HTTP 403 Forbidden)." : undefined,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
