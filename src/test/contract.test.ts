import { describe, expect, test } from "bun:test";
import { handleStatelessMcpRequest } from "../index.js";
import { handleStreamableHttpRequest } from "../server/streamable-http.js";

describe("MCP Specification & Contract Tests (2026-07-28 Spec)", () => {
  test("handles tools/list including core 8 legal tools", async () => {
    const res = await handleStatelessMcpRequest({ id: 10, method: "tools/list" });
    expect(res.jsonrpc).toBe("2.0");
    const toolNames = res.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("search_case_law");
    expect(toolNames).toContain("search_legislation");
    expect(toolNames).toContain("get_akn_document");
    expect(toolNames).toContain("get_documents_bulk");
    expect(toolNames).toContain("check_citator");
    expect(toolNames).toContain("verify_citation");
    expect(toolNames).toContain("get_cause_list");
    expect(toolNames).toContain("search_gazettes");
  });

  test("handles resources/list and resources/templates/list", async () => {
    const resStatic = await handleStatelessMcpRequest({ id: 11, method: "resources/list" });
    expect(resStatic.result.resources.length).toBeGreaterThanOrEqual(1);

    const resTemplates = await handleStatelessMcpRequest({ id: 12, method: "resources/templates/list" });
    expect(resTemplates.result.resourceTemplates.length).toBeGreaterThanOrEqual(3);
  });

  test("reads MCP resources statelessly", async () => {
    const res = await handleStatelessMcpRequest({
      id: 13,
      method: "resources/read",
      params: { uri: "kenyalaw://statutes/constitution-2010" },
    });
    expect(res.result.contents).toBeDefined();
    expect(res.result.contents[0].mimeType).toBe("text/markdown");
  }, { timeout: 15000 });

  test("handles initialize with protocol version negotiation (2026-07-28 default)", async () => {
    const res = await handleStatelessMcpRequest({
      id: 14,
      method: "initialize",
      params: { protocolVersion: "2026-07-28" },
    });
    expect(res.result.protocolVersion).toBe("2026-07-28");
    expect(res.result.serverInfo.name).toBe("kenya-law-mcp");
  });

  test("handles Streamable HTTP POST transport requests with 2026-07-28 spec header", async () => {
    const httpRes = await handleStreamableHttpRequest({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 15, method: "tools/list" }),
    });

    expect(httpRes.status).toBe(200);
    expect(httpRes.headers["X-MCP-Protocol-Version"]).toBe("2026-07-28");
    const parsedBody = JSON.parse(httpRes.body);
    expect(parsedBody.id).toBe(15);
  });
});
