import { describe, expect, spyOn, test } from "bun:test";
import { getAknDocument } from "../tools/get-akn-document.js";
import { searchCaseLaw } from "../tools/search-case-law.js";
import { searchLegislation } from "../tools/search-legislation.js";
import { getCauseList } from "../tools/get-cause-list.js";
import { checkCitator } from "../tools/check-citator.js";
import { verifyCitation } from "../tools/verify-citation.js";
import { getDocumentsBulk } from "../tools/get-documents-bulk.js";
import { TOOLS, handleStatelessMcpRequest } from "../index.js";
import { KenyaLawAccessBlockedError, KenyaLawClient, resolveCourtStation } from "../client/kenyaLawClient.js";

describe("Akoma Ntoso MCP Tools Interface", () => {
  test("defines core stateless AKN tools", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(6);
    const toolNames = TOOLS.map((t) => t.name);
    expect(toolNames).toContain("get_akn_document");
    expect(toolNames).toContain("get_documents_bulk");
    expect(toolNames).toContain("search_case_law");
    expect(toolNames).toContain("search_legislation");
    expect(toolNames).toContain("get_cause_list");
    expect(toolNames).toContain("check_citator");
    expect(toolNames).toContain("verify_citation");
    expect(toolNames).toContain("search_gazettes");
  });

  test("get_akn_document returns valid structure", async () => {
    const res = await getAknDocument({ akn_url: "/akn/ke/act/2010/4" });
    expect(res.content).toBeDefined();
    expect(res.content[0].type).toBe("text");
  }, { timeout: 30000 });

  test("search_case_law handles queries gracefully", async () => {
    const res = await searchCaseLaw({ query: "constitutional rights", limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.query).toBe("constitutional rights");
  }, { timeout: 30000 });

  test("search_case_law resolves court and year from parameters without explicit query", async () => {
    const res = await searchCaseLaw({ court: "Supreme Court", year: 2022, limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    if (parsed.isBlocked) {
      expect(res.isError).toBe(true);
      expect(parsed.court).toBe("Supreme Court");
    } else {
      expect(parsed.court).toBe("Supreme Court");
      expect(parsed.total_results).toBeGreaterThan(0);
      expect(parsed.results[0].court).toContain("Supreme Court");
      expect(parsed.results[0].akn_url).toContain("/kesc/");
    }
  }, { timeout: 30000 });

  test("search_case_law extracts court acronym and year from natural language query", async () => {
    const res = await searchCaseLaw({ query: "list top 5 cases in 2022 kesc/supremem court", limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    if (parsed.isBlocked) {
      expect(res.isError).toBe(true);
    } else {
      expect(parsed.total_results).toBeGreaterThan(0);
      expect(parsed.results[0].court).toContain("Supreme Court");
      expect(parsed.results[0].akn_url).toContain("/kesc/");
    }
  }, { timeout: 30000 });

  test("resolves court stations from the official court directory without location-specific mappings", async () => {
    try {
      const meru = await resolveCourtStation("Meru", "KEHC");
      const nakuru = await resolveCourtStation("High Court at Nakuru", "KEHC");
      expect({ meru, nakuru }).toEqual({ meru: "HCMRU", nakuru: "HCNKR" });
    } catch (err: any) {
      if (err?.isBlocked || err?.message?.includes("403")) {
        expect(err.message).toContain("403 Forbidden");
      } else {
        throw err;
      }
    }
  }, { timeout: 30000 });

  test("get_akn_document renders structured Markdown case register for court year directory URLs", async () => {
    const res = await getAknDocument({ akn_url: "https://kenyalaw.org/judgments/KESC/2022/" });
    expect(res.content).toBeDefined();
    const text = res.content[0].text;
    if (res.isError) {
      expect(text).toContain("403");
    } else {
      expect(text).toContain("# Supreme Court of Kenya - 2022 Judgments Directory");
      expect(text).toContain("| # | Case Title | Neutral Citation | Decision Date | Akoma Ntoso Link |");
      expect(text).toContain("/akn/ke/judgment/kesc/");
    }
  }, { timeout: 30000 });

  test("search_legislation handles act searches", async () => {
    const res = await searchLegislation({ act_name: "Penal Code", limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.act_name).toBe("Penal Code");
  }, { timeout: 30000 });

  test("get_cause_list retrieves daily court schedule", async () => {
    const res = await getCauseList({ court_station: "Milimani Law Courts" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.court_station).toBe("Milimani Law Courts");
  }, { timeout: 30000 });

  test("check_citator extracts precedent treatment", async () => {
    const res = await checkCitator({ case_akn_url: "/akn/ke/judgment/kehc/2026/8198" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.case_akn_url).toBe("/akn/ke/judgment/kehc/2026/8198");
  }, { timeout: 45000 });

  test("check_citator fails closed on fake or non-existent citations", async () => {
    const res = await checkCitator({ case_akn_url: "this-is-not-a-real-case-citation-xyz123" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.verified).toBe(false);
    expect(parsed.status).toBe("not_found");
  }, { timeout: 30000 });

  test("verify_citation validates legal citations", async () => {
    const res = await verifyCitation({ citation_string: "Employment Act" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.verified).toBeDefined();
  }, { timeout: 30000 });

  test("verify_citation sets verified: false on unverified citations", async () => {
    const res = await verifyCitation({ citation_string: "NonExistentFakeActXYZ999" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.verified).toBe(false);
  }, { timeout: 30000 });

  test("verify_citation propagates isBlocked: true when upstream portal access is blocked", async () => {
    const spy = spyOn(KenyaLawClient, "searchCaseLaw").mockRejectedValueOnce(
      new KenyaLawAccessBlockedError("Kenya Law portal access blocked (HTTP 403 Forbidden).")
    );
    try {
      const res = await verifyCitation({ citation_string: "Blocked Case Citation" });
      expect(res.isError).toBe(true);
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.verified).toBe(false);
      expect(parsed.isBlocked).toBe(true);
      expect(parsed.error).toContain("403");
    } finally {
      spy.mockRestore();
    }
  });

  test("check_citator returns status: 'blocked' and isBlocked: true when upstream access is blocked", async () => {
    const spy = spyOn(KenyaLawClient, "checkCitator").mockResolvedValueOnce({
      case_akn_url: "test_citation",
      neutral_citation: "test_citation",
      case_title: "Access Blocked (HTTP 403)",
      verified: false,
      status: "blocked" as any,
      treatment_note: "Kenya Law portal access blocked (HTTP 403 Forbidden).",
      citing_cases: [],
    });
    try {
      const res = await checkCitator({ citation: "test_citation" });
      expect(res.isError).toBe(true);
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.verified).toBe(false);
      expect(parsed.isBlocked).toBe(true);
      expect(parsed.status).toBe("blocked");
    } finally {
      spy.mockRestore();
    }
  });

  test("search_legislation returns isBlocked: true when upstream access is blocked", async () => {
    const spy = spyOn(KenyaLawClient, "searchLegislation").mockRejectedValueOnce(
      new KenyaLawAccessBlockedError("Kenya Law legislation access blocked (HTTP 403 Forbidden).")
    );
    try {
      const res = await searchLegislation({ act_name: "BlockedAct" });
      expect(res.isError).toBe(true);
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.isBlocked).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("get_documents_bulk retrieves multiple AKN documents", async () => {
    const res = await getDocumentsBulk({ akn_urls: ["/akn/ke/act/2010/4"] });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.documents.length).toBe(1);
  }, { timeout: 30000 });
});

describe("2026-07-28 Stateless MCP Specification Handler", () => {
  test("handles initialize statelessly without sessions or handshakes", async () => {
    const res = await handleStatelessMcpRequest({ id: 1, method: "initialize" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(1);
    expect(res.result.protocolVersion).toBeDefined();
    expect(res.result.serverInfo.name).toBe("kenya-law-mcp");
  });

  test("handles tools/list statelessly", async () => {
    const res = await handleStatelessMcpRequest({ id: 2, method: "tools/list" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.tools.length).toBeGreaterThanOrEqual(6);
  });

  test("handles tools/call statelessly with parameters", async () => {
    const res = await handleStatelessMcpRequest({
      id: 3,
      method: "tools/call",
      params: {
        name: "get_cause_list",
        arguments: { court_station: "Eldoret High Court" },
      },
    });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.content).toBeDefined();
  }, { timeout: 15000 });

  test("handles prompts/list and prompts/get statelessly", async () => {
    const listRes = await handleStatelessMcpRequest({ id: 5, method: "prompts/list" });
    expect(listRes.jsonrpc).toBe("2.0");
    expect(listRes.result.prompts.length).toBeGreaterThanOrEqual(3);

    const getRes = await handleStatelessMcpRequest({
      id: 6,
      method: "prompts/get",
      params: { name: "research_case_precedent", arguments: { issue: "land dispute" } },
    });
    expect(getRes.jsonrpc).toBe("2.0");
    expect(getRes.result.messages[0].content.text).toContain("land dispute");
  });
});
