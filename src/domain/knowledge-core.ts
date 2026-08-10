/**
 * src/domain/knowledge-core.ts — Core Legal Knowledge Layer for Kenyan Law.
 * Wraps low-level HTTP/AKN client and exposes domain entities, search, citations, and graph relationships.
 */

import { KenyaLawClient, type CitatorResult, type CaseSearchResult, type StatuteSearchResult } from "../client/kenyaLawClient.js";
import { parseLegalUrn, type CanonicalLegalEntity } from "./urn.js";
import { buildLegalProvenance, type LegalProvenance } from "./provenance.js";

export interface LegalObjectPayload {
  entity: CanonicalLegalEntity;
  text: string;
  markdown: string;
  sectionsCount?: number;
  status: "active_law" | "good_law" | "unverified" | "repealed";
  provenance: LegalProvenance;
}

export interface LegalRelationship {
  sourceUrn: string;
  targetUrn: string;
  relationship: "cites" | "citedBy" | "amends" | "interprets" | "follows";
  targetTitle: string;
}

export class KenyaLawKnowledgeCore {
  /**
   * Retrieves a canonical legal object by URN or AKN path.
   */
  static async getLegalObject(urnOrPath: string): Promise<LegalObjectPayload> {
    const entity = parseLegalUrn(urnOrPath);
    const aknUrl = urnOrPath.startsWith("/") ? urnOrPath : `/akn/ke/act/2010/4`;
    const doc = await KenyaLawClient.getAknDocument(aknUrl);

    const isLookupError = doc.title.includes("Lookup Error") || doc.docType === "unknown";
    const status = isLookupError ? "unverified" : "active_law";
    const markdown = doc.markdown || `# ${entity.title}\n\nAuthoritative text for ${urnOrPath}`;

    return {
      entity: {
        ...entity,
        title: doc.title || entity.title,
      },
      text: markdown.replace(/#+\s*/g, ""),
      markdown,
      sectionsCount: doc.sectionsCount || 1,
      status,
      provenance: buildLegalProvenance(
        doc.aknUrl || aknUrl,
        entity.urn,
        markdown,
        entity.type
      ),
    };
  }

  /**
   * Performs unified legal search across statutes, case law, and gazette notices.
   */
  static async search(query: string, options: { court?: string; yearFrom?: number; limit?: number } = {}) {
    const limit = options.limit || 10;
    const cases = await KenyaLawClient.searchCaseLaw(query, options.court, options.yearFrom, limit);
    const statutes = await KenyaLawClient.searchLegislation(query, limit);

    const results = [
      ...statutes.map((s) => ({
        id: parseLegalUrn(s.akn_url, s.short_title).urn,
        type: "statute" as const,
        title: s.short_title,
        citation: s.short_title,
        snippet: `Kenya Act of Parliament: ${s.short_title}`,
        score: 0.95,
        url: s.url,
      })),
      ...cases.map((c) => ({
        id: parseLegalUrn(c.akn_url, c.case_title).urn,
        type: "case" as const,
        title: c.case_title,
        citation: c.neutral_citation || c.oscola_citation,
        snippet: c.snippet || `Judicial Decision: ${c.case_title}`,
        score: 0.88,
        url: c.url,
      })),
    ].slice(0, limit);

    return {
      query,
      total_results: results.length,
      results,
    };
  }

  /**
   * Resolves and verifies a legal citation.
   */
  static async resolveCitation(citationString: string) {
    const verified = await KenyaLawClient.checkCitator(citationString);
    const entity = parseLegalUrn(citationString);

    return {
      valid: verified.verified,
      canonicalId: entity.urn,
      citationString,
      status: verified.status,
      caseTitle: verified.case_title,
      citingCasesCount: verified.citing_cases.length,
    };
  }

  /**
   * Retrieves citation graph relationships for a legal entity.
   */
  static async getRelationships(urnOrPath: string): Promise<{ urn: string; relationships: LegalRelationship[] }> {
    const citator = await KenyaLawClient.checkCitator(urnOrPath);
    const relationships: LegalRelationship[] = citator.citing_cases.map((c) => ({
      sourceUrn: urnOrPath,
      targetUrn: parseLegalUrn(c.akn_url || c.citation).urn,
      relationship: "citedBy",
      targetTitle: c.citation,
    }));

    return {
      urn: urnOrPath,
      relationships,
    };
  }
}
