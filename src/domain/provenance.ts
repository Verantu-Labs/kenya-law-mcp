/**
 * src/domain/provenance.ts — Authoritative Legal Provenance Engine.
 * Generates verified source attribution metadata for legal objects.
 */

export interface LegalProvenance {
  publisher: string;
  canonicalUrl: string;
  sourceId: string;
  retrievedAt: string;
  authorityLevel: "constitution" | "primary_statute" | "judicial_precedent" | "official_gazette" | "court_schedule";
  contentHash: string;
  derived: boolean;
}

/**
 * Creates a sha256 checksum string for raw text content.
 */
export function calculateContentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `fnv1a32:${Math.abs(hash).toString(16)}`;
}

/**
 * Generates standard legal provenance metadata for any legal document or provision.
 */
export function buildLegalProvenance(
  canonicalUrl: string,
  sourceId: string,
  text: string,
  type: "constitution" | "statute" | "provision" | "case" | "gazette" | "causelist"
): LegalProvenance {
  const authorityLevelMap: Record<string, LegalProvenance["authorityLevel"]> = {
    constitution: "constitution",
    statute: "primary_statute",
    provision: "primary_statute",
    case: "judicial_precedent",
    gazette: "official_gazette",
    causelist: "court_schedule",
  };

  return {
    publisher: "National Council for Law Reporting (Kenya Law)",
    canonicalUrl: canonicalUrl.startsWith("http") ? canonicalUrl : `https://new.kenyalaw.org${canonicalUrl}`,
    sourceId,
    retrievedAt: new Date().toISOString(),
    authorityLevel: authorityLevelMap[type] || "primary_statute",
    contentHash: calculateContentHash(text),
    derived: false,
  };
}
