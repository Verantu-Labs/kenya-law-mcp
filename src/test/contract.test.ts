import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { handleStatelessMcpRequest, TOOLS } from "../index.js";
import worker from "../worker.js";
import { ToolCallLimiter } from "../mcp/tool-limit.js";
import { CallToolResultSchema } from "@modelcontextprotocol/core";

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" };
async function readRpc(response: Response): Promise<any> {
  const body = await response.text();
  if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return JSON.parse(body.split("\n").find(line => line.startsWith("data: "))!.slice(6));
  }
  return JSON.parse(body);
}
const request = (payload: unknown) => new Request("https://example.test/mcp", { method: "POST", headers, body: JSON.stringify(payload) });

const modernRequest = (method: string, params: Record<string, unknown> = {}, version = "2026-07-28") => new Request("https://example.test/mcp", {
  method: "POST",
  headers: { ...headers, "MCP-Protocol-Version": version, "Mcp-Method": method,
    ...(params.name ? { "Mcp-Name": String(params.name) } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 20, method, params: { ...params, _meta: {
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientInfo": { name: "contract-test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  } } }),
});

describe("HTTP MCP transport", () => {
  let network: ReturnType<typeof spyOn>;
  afterEach(() => network?.mockRestore());

  test("modern discovery and tool listing require no initialize exchange", async () => {
    const discovery = await readRpc(await worker.fetch(modernRequest("server/discover")));
    expect(discovery.result).toMatchObject({ _meta: { "io.modelcontextprotocol/serverInfo": { name: "kenya-law-mcp" } }, capabilities: { tools: {}, resources: {}, prompts: {} } });
    expect(discovery.result.supportedVersions).toContain("2026-07-28");
    const list = await readRpc(await worker.fetch(modernRequest("tools/list")));
    expect(list.result.tools).toEqual(TOOLS);
  });

  test("modern version rejection lists supported revisions", async () => {
    const response = await worker.fetch(modernRequest("tools/list", {}, "2099-01-01"));
    expect(response.status).toBe(400);
    expect((await readRpc(response)).error).toMatchObject({ code: -32022, data: { requested: "2099-01-01" } });
  });

  test("modern transport rejects mismatched and missing metadata headers", async () => {
    const mismatched = modernRequest("tools/list");
    mismatched.headers.set("Mcp-Method", "tools/call");
    const missing = modernRequest("tools/list");
    missing.headers.delete("Mcp-Method");
    const responses = await Promise.all([worker.fetch(mismatched), worker.fetch(missing)]);
    expect(responses.map(response => response.status)).toEqual([400, 400]);
    for (const response of responses) expect((await readRpc(response)).error.code).toBe(-32020);
  });

  test("modern independent concurrent requests return valid tool results and errors", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response('<akomaNtoso><act><body><section><content><p>Concurrent fixture provision.</p></content></section></body></act></akomaNtoso>'));
    const responses = await Promise.all([
      worker.fetch(modernRequest("tools/call", { name: "get_akn_document", arguments: { akn_url: "/akn/ke/act/2020/concurrent/source" } })),
      worker.fetch(modernRequest("tools/call", { name: "get_akn_document", arguments: {} })),
      worker.fetch(modernRequest("tools/call", { name: "get_akn_document", arguments: { akn_url: false } })),
    ]);
    const results = await Promise.all(responses.map(readRpc));
    expect(results[0].result.content[0].text).toContain("Concurrent fixture provision.");
    expect(results[1].result.isError).toBe(true);
    expect(results[2].error.code).toBe(-32602);
    expect(responses.every(response => !response.headers.has("Mcp-Session-Id"))).toBe(true);
    expect(results.slice(0, 2).every(response => CallToolResultSchema.safeParse(response.result).success)).toBe(true);
  });

  test("unknown tools and malformed REST inputs return explicit request errors", async () => {
    const unknown = await readRpc(await worker.fetch(modernRequest("tools/call", { name: "unknown" })));
    expect(unknown.error.code).toBe(-32602);
    const response = await worker.fetch(new Request("https://example.test/api/v1/get_akn_document", {
      method: "POST", body: JSON.stringify({ akn_url: false }),
    }));
    expect(response.status).toBe(400);
    for (const params of [{}, { name: false }, { name: "get_akn_document", arguments: [] }]) {
      const malformed = await readRpc(await worker.fetch(modernRequest("tools/call", params)));
      expect(malformed.error.code).toBe(-32602);
    }
  });

  test("prompts reject missing required arguments rather than inserting a fabricated task", async () => {
    for (const args of [{}, { issue: false }]) {
      const result = await readRpc(await worker.fetch(modernRequest("prompts/get", { name: "research_case_precedent", arguments: args })));
      expect(result.error.code).toBe(-32602);
    }
  });

  test("oversized streamed MCP and REST requests are rejected before dispatch", async () => {
    for (const path of ["/mcp", "/api/v1/get_akn_document"]) {
      const response = await worker.fetch(new Request(`https://example.test${path}`, {
        method: "POST", headers, body: new ReadableStream({ start(controller) {
          controller.enqueue(new Uint8Array(128 * 1024 + 1));
          controller.close();
        } }), duplex: "half",
      } as RequestInit));
      expect(response.status).toBe(413);
    }
  });

  test("initializes and negotiates unsupported protocol versions", async () => {
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "unsupported", capabilities: {}, clientInfo: { name: "test", version: "1" } } }));
    const result = await readRpc(response);
    expect({ status: response.status, version: result.result.protocolVersion, name: result.result.serverInfo.name })
      .toEqual({ status: 200, version: "2025-11-25", name: "kenya-law-mcp" });
  });

  test("lists all tools through the production Worker", async () => {
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: "tools", method: "tools/list" }));
    expect(await readRpc(response)).toEqual({ jsonrpc: "2.0", id: "tools", result: { tools: TOOLS } });
  });

  test("acknowledges initialized notifications without a JSON-RPC reply", async () => {
    const response = await worker.fetch(request({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect({ status: response.status, body: await response.text() }).toEqual({ status: 202, body: "" });
  });

  test("rejects invalid JSON, invalid requests and unsupported version headers", async () => {
    const invalidJson = await worker.fetch(new Request("https://example.test/mcp", { method: "POST", headers, body: "{" }));
    const invalidRequest = await worker.fetch(request({ unexpected: true }));
    const invalidVersion = await worker.fetch(new Request("https://example.test/mcp", { method: "POST",
      headers: { ...headers, "MCP-Protocol-Version": "unknown" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }));
    expect([invalidJson.status, invalidRequest.status, invalidVersion.status]).toEqual([400, 400, 400]);
  });

  test("GET does not advertise an unavailable SSE stream", async () => {
    const response = await worker.fetch(new Request("https://example.test/mcp", { headers: { Accept: "text/event-stream" } }));
    expect(response.status).toBe(405);
  });

  test("rejects opaque origins and does not let headers override REST dispatch", async () => {
    expect((await worker.fetch(new Request("https://example.test/mcp", { headers: { Origin: "null" } }))).status).toBe(403);
    const response = await worker.fetch(new Request("https://example.test/api/v1/get_akn_document", {
      method: "POST", headers: { "mcp-method": "tools/list" }, body: "{}" }));
    expect((await readRpc(response)).isError).toBe(true);
  });

  test("Constitution resource requests the Constitution and returns its text", async () => {
    const urls: string[] = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async input => {
      urls.push(String(input));
      return new Response('<akomaNtoso><act><meta><identification><FRBRWork><FRBRname value="Constitution of Kenya"/></FRBRWork></identification></meta><body><section><num>50.</num><content><p>Fixture fair hearing provision.</p></content></section></body></act></akomaNtoso>');
    });
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "kenyalaw://statutes/constitution-2010" } }));
    const result = await readRpc(response);
    expect(result.result.contents[0].text).toContain("Fixture fair hearing provision.");
    expect(urls.every(url => url.includes("/akn/ke/act/2010/constitution/eng@2010-09-03"))).toBe(true);
  });

  test("resource failures are protocol errors, never successful lookup-error text", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response("blocked", { status: 403 }));
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "kenyalaw://case/kehc/2019/9901" } }));
    const result = await readRpc(response);
    expect({ id: result.id, code: result.error.code, result: result.result }).toEqual({ id: 3, code: -32602, result: undefined });
  });

  test("unknown methods and invalid parameter envelopes return protocol errors", async () => {
    expect(await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 0, method: "missing" }))
      .toEqual({ jsonrpc: "2.0", id: 0, error: { code: -32601, message: "Unsupported method: missing" } });
    expect(await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: [] }))
      .toEqual({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } });
  });
});

test("tool capacity releases slots after failure and expires the minute budget", async () => {
  const limiter = new ToolCallLimiter();
  const result = { content: [{ type: "text" as const, text: "fixture" }] };
  const clock = spyOn(Date, "now").mockReturnValue(0);
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  try {
    const active = Array.from({ length: 4 }, () => limiter.run(async () => { await pending; return result; }));
    expect((await limiter.run(async () => result)).isError).toBe(true);
    release();
    expect(await Promise.all(active)).toEqual([result, result, result, result]);
    await expect(limiter.run(async () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    expect(await limiter.run(async () => result)).toEqual(result);
    for (let index = 6; index < 60; index++) await limiter.run(async () => result);
    expect((await limiter.run(async () => result)).isError).toBe(true);
    clock.mockReturnValue(60000);
    expect(await limiter.run(async () => result)).toEqual(result);
  } finally {
    release();
    clock.mockRestore();
  }
});
