import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { KenyaLawClient, resolveCourtStation } from "../client/kenyaLawClient.js";
import { getAknDocument } from "../tools/get-akn-document.js";
import { getDocumentsBulk } from "../tools/get-documents-bulk.js";
import { searchCaseLaw } from "../tools/search-case-law.js";
import { searchLegislation } from "../tools/search-legislation.js";
import { verifyCitation } from "../tools/verify-citation.js";
import { checkCitator } from "../tools/check-citator.js";
import { handleStatelessMcpRequest, TOOLS } from "../index.js";
import worker from "../worker.js";

// Only the network boundary is replaced: these tests exercise the actual client,
// parsers, tool handlers and protocol adapter without relying on portal uptime.
describe("Synchronized retrieval regressions", () => {
  let network: ReturnType<typeof spyOn>;
  afterEach(() => network?.mockRestore());

  test("court-year directories retain metadata and fetch the second page", async () => {
    const urls: string[] = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      return new Response(url.includes("page=2")
        ? '<a href="/akn/ke/judgment/kesc/2017/902">Beta v State [2017] KESC 902</a>'
        : '<a href="/akn/ke/judgment/kesc/2017/901">Alpha &amp; Another v State [2017] KESC 901</a><a href="?page=2">Next</a>');
    });
    const results = await KenyaLawClient.fetchCourtYearDirectory("KESC", 2017, [], 2);
    expect(results).toEqual([
      { case_title: "Alpha & Another v State [2017] KESC 901", neutral_citation: "[2017] KESC 901", court: "Supreme Court of Kenya", year: 2017, akn_url: "/akn/ke/judgment/kesc/2017/901", url: "https://kenyalaw.org/akn/ke/judgment/kesc/2017/901", source: "kenyalaw.org", oscola_citation: "Alpha & Another v State [2017] KESC 901" },
      { case_title: "Beta v State [2017] KESC 902", neutral_citation: "[2017] KESC 902", court: "Supreme Court of Kenya", year: 2017, akn_url: "/akn/ke/judgment/kesc/2017/902", url: "https://kenyalaw.org/akn/ke/judgment/kesc/2017/902", source: "kenyalaw.org", oscola_citation: "Beta v State [2017] KESC 902" },
    ]);
    expect(urls).toEqual(["https://kenyalaw.org/judgments/KESC/2017/", "https://kenyalaw.org/judgments/KESC/2017/?page=2"]);
  });

  test("station discovery feeds the station, year and month directory", async () => {
    const urls: string[] = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(String(input).endsWith("/judgments/KECA/")
        ? '<a href="/judgments/KECA/TEST-STATION/">Court of Appeal at Example</a>'
        : '<a href="/akn/ke/judgment/keca/2018/901">Example v State [2018] KECA 901</a>');
    });
    expect(await resolveCourtStation("Example", "KECA")).toBe("TEST-STATION");
    const result = await searchCaseLaw({ court: "KECA", court_station: "Example", year: 2018, month: 8, limit: 1 });
    expect(JSON.parse(result.content[0].text)).toEqual({
      query: "KECA 2018", total_results: 1, court_filter: "KECA", court: "KECA", court_station: "Example", year: 2018, month: 8,
      results: [{ case_title: "Example v State [2018] KECA 901", neutral_citation: "[2018] KECA 901", court: "Court of Appeal of Kenya", year: 2018, akn_url: "/akn/ke/judgment/keca/2018/901", url: "https://kenyalaw.org/akn/ke/judgment/keca/2018/901", source: "kenyalaw.org", oscola_citation: "Example v State [2018] KECA 901" }],
    });
    expect(urls).toEqual(["https://new.kenyalaw.org/judgments/KECA/", "https://kenyalaw.org/judgments/KECA/TEST-STATION/2018/8/"]);
  });

  test("relative document URLs use HTTPS, redirects, timeout and official-host fallback", async () => {
    const requests: Array<{ url: string; redirect?: RequestRedirect; timeout: boolean }> = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ url: String(input), redirect: init?.redirect, timeout: init?.signal instanceof AbortSignal });
      return String(input).includes("new.kenyalaw.org")
        ? new Response("blocked", { status: 403 })
        : new Response('<akomaNtoso><act><meta><identification><FRBRWork><FRBRname value="Fixture Act"/></FRBRWork></identification></meta><body><section><num>1.</num><heading>Scope</heading><content><p>Fixture provision.</p></content></section></body></act></akomaNtoso>');
    });
    const result = await getAknDocument({ akn_url: "/akn/ke/act/2018/901/source" });
    expect(result.content[0].text).toContain("Fixture provision.");
    expect(requests).toEqual([
      { url: "https://new.kenyalaw.org/akn/ke/act/2018/901/source", redirect: "follow", timeout: true },
      { url: "https://kenyalaw.org/akn/ke/act/2018/901/source", redirect: "follow", timeout: true },
    ]);
  });

  test.each([0, 8])("DOCX source extraction supports compression method %i", async (method) => {
    const name = new TextEncoder().encode("word/document.xml");
    const xml = new TextEncoder().encode('<w:document><w:body><w:p><w:r><w:t>Fixture judgment &amp; reasons.</w:t></w:r></w:p></w:body></w:document>');
    const body = method === 8 ? deflateRawSync(xml) : xml;
    const zip = new Uint8Array(30 + name.length + body.length);
    const header = new DataView(zip.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(8, method, true);
    header.setUint32(18, body.length, true);
    header.setUint32(22, xml.length, true);
    header.setUint16(26, name.length, true);
    zip.set(name, 30);
    zip.set(body, 30 + name.length);
    network = spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip));
    const result = await getAknDocument({ akn_url: `/akn/ke/judgment/kehc/2018/90${method}/source` });
    expect(result.content[0].text).toContain("Fixture judgment & reasons.");
  });

  test("blocked searches and document reads become MCP errors", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response("blocked", { status: 403 }));
    const results = [
      await searchCaseLaw({ query: "fixture-blocked-query" }),
      await searchLegislation({ act_name: "Fixture Blocked Act" }),
      await getAknDocument({ akn_url: "/akn/ke/judgment/kehc/2018/903" }),
      await verifyCitation({ citation_string: "/akn/ke/judgment/kehc/2018/904" }),
      await checkCitator({ case_akn_url: "/akn/ke/judgment/kehc/2018/905" }),
    ];
    expect(results.map(result => ({ isError: result.isError, isBlocked: JSON.parse(result.content[0].text).isBlocked })))
      .toEqual(Array(5).fill({ isError: true, isBlocked: true }));
  });

  test.each([new TypeError("Network unavailable"), new DOMException("Timed out", "TimeoutError")])("document network failures become tool errors: %s", async error => {
    network = spyOn(globalThis, "fetch").mockRejectedValue(error);
    const result = await getAknDocument({ akn_url: `/akn/ke/act/2018/${error.name}/source` });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain(error.message);
  });

  test("section extraction returns a bounded provision and missing sections fail", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response('<html><title>Fixture Act</title><main><p>12. Duties</p><p>The officer shall keep records.</p><p>13. Offences</p><p>The penalty follows.</p></main></html>'));
    const result = await getAknDocument({ akn_url: "/akn/ke/act/2018/906/source", section: "12" });
    expect(result.content[0].text).toContain("The officer shall keep records.");
    expect(result.content[0].text).not.toContain("The penalty follows.");
    expect((await getAknDocument({ akn_url: "/akn/ke/act/2018/906/source", section: "99" })).isError).toBe(true);
  });

  test("retrieving a judgment establishes existence, not subsequent treatment", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response('<akomaNtoso><judgment><meta><identification><FRBRWork><FRBRname value="Fixture v State"/></FRBRWork></identification><publication name="[2018] KEHC 907"/></meta><judgmentBody><p>Fixture reasons.</p></judgmentBody></judgment></akomaNtoso>'));
    const result = await checkCitator({ case_akn_url: "/akn/ke/judgment/kehc/2018/907/source" });
    expect(JSON.parse(result.content[0].text)).toEqual({
      case_akn_url: "/akn/ke/judgment/kehc/2018/907/source", neutral_citation: "[2018] KEHC 907", case_title: "Fixture v State", verified: true, status: "not_checked",
      treatment_note: "Official document found. Subsequent judicial treatment has not been retrieved; this does not establish that the decision remains good law.", citing_cases: [],
    });
  });

  test("valid empty search responses retain their normal result envelope", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("feeds") ? "<feed></feed>" : "<html><main>No results</main></html>"));
    expect(JSON.parse((await searchCaseLaw({ query: "fixture-empty-query" })).content[0].text)).toEqual({ query: "fixture-empty-query", total_results: 0, court_filter: "All Courts", results: [] });
    expect(JSON.parse((await searchLegislation({ act_name: "Fixture Empty Act" })).content[0].text)).toEqual({ act_name: "Fixture Empty Act", count: 0, results: [] });
  });

  test("missing tool identifiers and non-array bulk inputs fail before fetching", async () => {
    network = spyOn(globalThis, "fetch");
    for (const tool of TOOLS) {
      const result = await handleStatelessMcpRequest({ id: 1, method: "tools/call", params: { name: tool.name, arguments: {} } });
      expect(result.result.isError).toBe(true);
    }
    expect((await getDocumentsBulk({ akn_urls: "invalid" as unknown as string[] })).isError).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  test("Worker REST route executes the synchronized search handler", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response('<a href="/akn/ke/judgment/kesc/2016/901">Fixture v State [2016] KESC 901</a>'));
    const response = await worker.fetch(new Request("https://example.test/api/v1/search_case_law", { method: "POST", body: JSON.stringify({ court: "KESC", year: 2016, limit: 1 }) }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.parse(result.content[0].text).results[0].akn_url).toBe("/akn/ke/judgment/kesc/2016/901");
  });
});

test.each(["2025-03-26", "2025-11-25"])("standalone stdio initializes, lists and calls tools with protocol %s", async (protocolVersion) => {
  const child = Bun.spawn([process.execPath, "run", "src/index.ts"], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  const readResponse = async () => {
    while (!output.includes("\n")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Server exited before replying: ${await new Response(child.stderr).text()}`);
      output += decoder.decode(chunk.value);
    }
    const lineEnd = output.indexOf("\n");
    const response = JSON.parse(output.slice(0, lineEnd));
    output = output.slice(lineEnd + 1);
    return response;
  };
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "regression-test", version: "1" } } }) + "\n");
    child.stdin.flush();
    const initialized = await readResponse();
    expect(initialized.result.serverInfo.name).toBe("kenya-law-mcp");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    child.stdin.flush();
    expect((await readResponse()).result.tools).toEqual(TOOLS);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_case_law", arguments: {} } }) + "\n");
    child.stdin.flush();
    expect((await readResponse()).result.isError).toBe(true);
  } finally {
    clearTimeout(timeout);
    await reader.cancel();
    child.kill();
    await child.exited;
  }
}, 10000);
