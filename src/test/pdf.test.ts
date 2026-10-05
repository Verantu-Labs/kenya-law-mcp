import { describe, expect, test } from "bun:test";
import { KenyaLawClient } from "../client/kenyaLawClient.js";

describe("Kenya Law In-Memory PDF Extraction", () => {
  test("getAknDocument extracts text from live Kenya Law PDF bill", async () => {
    // The Artificial Intelligence Bill, 2026 (Senate Bill)
    const uri = "/akn/ke/bill/senate/2026-02-19/the-artificial-intelligence-bill-2026/eng@2026-02-19";
    const doc = await KenyaLawClient.getAknDocument(uri);

    expect(doc).toBeDefined();
    expect(doc.markdown).toContain("THE ARTIFICIAL INTELLIGENCE BILL, 2026");
    expect(doc.markdown).toContain("ARRANGEMENT OF CLAUSES");
    expect(doc.markdown).toContain("Office of the Artificial Intelligence Commissioner");
    expect(doc.sectionsCount).toBeGreaterThan(1);
  }, 30000);
});
