/**
 * src/domain/urn.ts - Canonical Kenyan Legal Entity URN & Identifier Normalizer.
 * Synthesizes stable URNs (e.g. ke:statute:employment-act-2007:s43, ke:case:kesc:2024:1)
 * from raw citations, AKN paths, and search titles.
 */

export interface CanonicalLegalEntity {
  urn: string;
  type: "constitution" | "statute" | "provision" | "case" | "gazette" | "causelist";
  title: string;
  citation: string;
  slug: string;
  section?: string;
  courtCode?: string;
  year?: number;
}

/**
 * Parses or normalizes a legal input (AKN path, URN, or citation) into a CanonicalLegalEntity object.
 */
export function parseLegalUrn(input: string, titleHint?: string): CanonicalLegalEntity {
  const cleanInput = input.trim();

  // 1. Direct Canonical URN match
  if (cleanInput.startsWith("ke:")) {
    const parts = cleanInput.split(":");
    const type = parts[1] as CanonicalLegalEntity["type"];
    const slug = parts[2] || "unknown";
    const section = parts[3];

    return {
      urn: cleanInput,
      type: type || "statute",
      title: titleHint || slug.replace(/-/g, " "),
      citation: section ? `${slug.replace(/-/g, " ")}, ${section}` : slug.replace(/-/g, " "),
      slug,
      section,
    };
  }

  // 2. Akoma Ntoso URI match (/akn/ke/act/2010/4 or /akn/ke/judgment/kehc/2026/8198)
  if (cleanInput.includes("/akn/ke/")) {
    if (cleanInput.includes("/act/")) {
      const yearMatch = cleanInput.match(/\/act\/(\d{4})\/(\d+)/);
      const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : undefined;
      const slug = cleanInput.split("/").pop() || "statute";
      const sectionMatch = cleanInput.match(/#sec[_-]?(\d+[a-z]?)/i);
      const section = sectionMatch?.[1] ? `s${sectionMatch[1]}` : undefined;

      const urn = section ? `ke:statute:${slug}:${section}` : `ke:statute:${slug}`;

      return {
        urn,
        type: section ? "provision" : "statute",
        title: titleHint || slug.replace(/-/g, " "),
        citation: titleHint || slug.replace(/-/g, " "),
        slug,
        section,
        year,
      };
    }

    if (cleanInput.includes("/judgment/")) {
      const parts = cleanInput.replace(/^\/akn\/ke\/judgment\//, "").split("/");
      const courtCode = parts[0] || "kehc";
      const year = parts[1] ? parseInt(parts[1], 10) : undefined;
      const caseId = parts[2] || "1";
      const urn = `ke:case:${courtCode}:${year || 2026}:${caseId}`;

      return {
        urn,
        type: "case",
        title: titleHint || `Judgment [${year || 2026}] ${courtCode.toUpperCase()} ${caseId}`,
        citation: titleHint || `[${year || 2026}] ${courtCode.toUpperCase()} ${caseId}`,
        slug: `${courtCode}-${year}-${caseId}`,
        courtCode,
        year,
      };
    }
  }

  // 3. Fallback: Generate URN from text citation string
  const slugified = cleanInput
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const urn = cleanInput.toLowerCase().includes("act") ? `ke:statute:${slugified}` : `ke:case:${slugified}`;

  return {
    urn,
    type: cleanInput.toLowerCase().includes("act") ? "statute" : "case",
    title: titleHint || cleanInput,
    citation: cleanInput,
    slug: slugified,
  };
}
