import { describe, expect, test } from "bun:test";
import { getAknDocument } from "../tools/get-akn-document.js";
import { searchCaseLaw } from "../tools/search-case-law.js";
import { searchLegislation } from "../tools/search-legislation.js";
import { getCauseList } from "../tools/get-cause-list.js";
import { checkCitator } from "../tools/check-citator.js";
import { TOOLS, handleStatelessMcpRequest } from "../index.js";

describe("Akoma Ntoso MCP Tools Interface", () => {
  test("defines 6 core stateless AKN tools", () => {
    expect(TOOLS.length).toBe(6);
    const toolNames = TOOLS.map((t) => t.name);
    expect(toolNames).toContain("get_akn_document");
    expect(toolNames).toContain("search_case_law");
    expect(toolNames).toContain("search_legislation");
    expect(toolNames).toContain("get_cause_list");
    expect(toolNames).toContain("check_citator");
    expect(toolNames).toContain("search_gazettes");
  });

  test("get_akn_document returns valid structure", async () => {
    const res = await getAknDocument({ akn_url: "/akn/ke/act/2010/4" });
    expect(res.content).toBeDefined();
    expect(res.content[0].type).toBe("text");
  });

  test("search_case_law handles queries gracefully", async () => {
    const res = await searchCaseLaw({ query: "constitutional rights", limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.query).toBe("constitutional rights");
  });

  test("search_legislation handles act searches", async () => {
    const res = await searchLegislation({ act_name: "Penal Code", limit: 3 });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.act_name).toBe("Penal Code");
  });

  test("get_cause_list retrieves daily court schedule", async () => {
    const res = await getCauseList({ court_station: "Milimani Law Courts" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.court_station).toBe("Milimani Law Courts");
  });

  test("check_citator extracts precedent treatment", async () => {
    const res = await checkCitator({ case_akn_url: "/akn/ke/judgment/kehc/2026/8198" });
    expect(res.content).toBeDefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.case_akn_url).toBe("/akn/ke/judgment/kehc/2026/8198");
  });
});

describe("2026-07-28 Stateless MCP Specification Handler", () => {
  test("handles initialize statelessly without sessions or handshakes", async () => {
    const res = await handleStatelessMcpRequest({ id: 1, method: "initialize" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(1);
    expect(res.result.protocolVersion).toBe("2024-11-05");
    expect(res.result.serverInfo.name).toBe("kenya-law-mcp");
  });

  test("handles tools/list statelessly", async () => {
    const res = await handleStatelessMcpRequest({ id: 2, method: "tools/list" });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.tools.length).toBe(6);
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
  });

  test("supports Mcp-Method and Mcp-Name header-based routing", async () => {
    const res = await handleStatelessMcpRequest(
      { id: 4, params: { arguments: { act_name: "Employment Act" } } },
      { "mcp-method": "tools/call", "mcp-name": "search_legislation" }
    );
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result.content).toBeDefined();
  });
});
