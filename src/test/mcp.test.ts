import { describe, expect, spyOn, test } from "bun:test";
import { searchLegislation } from "../tools/search-legislation.js";
import { checkCitator } from "../tools/check-citator.js";
import { verifyCitation } from "../tools/verify-citation.js";
import { TOOLS, handleStatelessMcpRequest } from "../index.js";
import { KenyaLawAccessBlockedError, KenyaLawClient } from "../client/kenyaLawClient.js";

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

});

describe("MCP dispatch", () => {
  test("handles initialize statelessly without sessions or handshakes", async () => {
    const res = await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(1);
    expect(res.result.protocolVersion).toBeDefined();
    expect(res.result.serverInfo.name).toBe("kenya-law-mcp");
  });

  test("handles tools/list statelessly", async () => {
    const res = await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.tools.length).toBeGreaterThanOrEqual(6);
  });


  test("handles prompts/list and prompts/get statelessly", async () => {
    const listRes = await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 5, method: "prompts/list" });
    expect(listRes.jsonrpc).toBe("2.0");
    expect(listRes.result.prompts.length).toBeGreaterThanOrEqual(3);

    const getRes = await handleStatelessMcpRequest({ jsonrpc: "2.0",
      id: 6,
      method: "prompts/get",
      params: { name: "research_case_precedent", arguments: { issue: "land dispute" } },
    });
    expect(getRes.jsonrpc).toBe("2.0");
    expect(getRes.result.messages[0].content.text).toContain("land dispute");
  });
});
