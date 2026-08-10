import { describe, expect, test } from "bun:test";
import { parseLegalUrn } from "../domain/urn.js";
import { calculateContentHash, buildLegalProvenance } from "../domain/provenance.js";
import { KenyaLawKnowledgeCore } from "../domain/knowledge-core.js";

describe("Domain Models & URN Resolver", () => {
  test("parses canonical legal URN strings", () => {
    const urn = parseLegalUrn("ke:statute:employment-act-2007:s43");
    expect(urn.type).toBe("statute");
    expect(urn.slug).toBe("employment-act-2007");
    expect(urn.section).toBe("s43");
  });

  test("converts AKN URIs to canonical URNs", () => {
    const actUrn = parseLegalUrn("/akn/ke/act/2010/4");
    expect(actUrn.urn).toBe("ke:statute:4");

    const caseUrn = parseLegalUrn("/akn/ke/judgment/kehc/2026/8198");
    expect(caseUrn.urn).toBe("ke:case:kehc:2026:8198");
    expect(caseUrn.courtCode).toBe("kehc");
    expect(caseUrn.year).toBe(2026);
  });

  test("generates legal provenance metadata with checksums", () => {
    const text = "Section 43 of Employment Act 2007";
    const hash = calculateContentHash(text);
    expect(hash).toContain("fnv1a32:");

    const provenance = buildLegalProvenance(
      "/akn/ke/act/2007/11",
      "ke:statute:employment-act-2007:s43",
      text,
      "statute"
    );

    expect(provenance.publisher).toContain("Kenya Law");
    expect(provenance.authorityLevel).toBe("primary_statute");
    expect(provenance.derived).toBe(false);
  });

  test("KenyaLawKnowledgeCore performs unified search and resolution", async () => {
    const searchRes = await KenyaLawKnowledgeCore.search("Employment Act", { limit: 3 });
    expect(searchRes.results).toBeDefined();
    expect(Array.isArray(searchRes.results)).toBe(true);
  }, { timeout: 30000 });
});
