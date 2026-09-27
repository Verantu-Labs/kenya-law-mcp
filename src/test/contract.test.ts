import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { handleStatelessMcpRequest, TOOLS } from "../index.js";
import worker from "../worker.js";

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" };
const request = (payload: unknown) => new Request("https://example.test/mcp", { method: "POST", headers, body: JSON.stringify(payload) });

describe("HTTP MCP transport", () => {
  let network: ReturnType<typeof spyOn>;
  afterEach(() => network?.mockRestore());

  test("initializes and negotiates unsupported protocol versions", async () => {
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "unsupported", capabilities: {}, clientInfo: { name: "test", version: "1" } } }));
    const result = await response.json();
    expect({ status: response.status, version: result.result.protocolVersion, name: result.result.serverInfo.name })
      .toEqual({ status: 200, version: "2025-11-25", name: "kenya-law-mcp" });
  });

  test("lists all tools through the production Worker", async () => {
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: "tools", method: "tools/list" }));
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: "tools", result: { tools: TOOLS } });
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
    expect((await response.json()).isError).toBe(true);
  });

  test("Constitution resource requests the Constitution and returns its text", async () => {
    const urls: string[] = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async input => {
      urls.push(String(input));
      return new Response('<akomaNtoso><act><meta><identification><FRBRWork><FRBRname value="Constitution of Kenya"/></FRBRWork></identification></meta><body><section><num>50.</num><content><p>Fixture fair hearing provision.</p></content></section></body></act></akomaNtoso>');
    });
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "kenyalaw://statutes/constitution-2010" } }));
    const result = await response.json();
    expect(result.result.contents[0].text).toContain("Fixture fair hearing provision.");
    expect(urls.every(url => url.includes("/akn/ke/act/2010/constitution/eng@2010-09-03"))).toBe(true);
  });

  test("resource failures are protocol errors, never successful lookup-error text", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response("blocked", { status: 403 }));
    const response = await worker.fetch(request({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "kenyalaw://case/kehc/2019/9901" } }));
    const result = await response.json();
    expect({ id: result.id, code: result.error.code, result: result.result }).toEqual({ id: 3, code: -32602, result: undefined });
  });

  test("unknown methods and invalid parameter envelopes return protocol errors", async () => {
    expect(await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 0, method: "missing" }))
      .toEqual({ jsonrpc: "2.0", id: 0, error: { code: -32601, message: "Unsupported method: missing" } });
    expect(await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: [] }))
      .toEqual({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } });
  });
});
