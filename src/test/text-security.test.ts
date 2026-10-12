import { afterEach, expect, spyOn, test } from "bun:test";
import { parse } from "marked";
import { parseDocument } from "htmlparser2";
import { parseAknXml } from "../akn/parser.js";
import { KenyaLawClient } from "../client/kenyaLawClient.js";
import { getAknDocument } from "../tools/get-akn-document.js";
import { handleStatelessMcpRequest } from "../index.js";
import { escapeMarkdownText, htmlElements, htmlToText, markdownDestination, nodeToText } from "../parsing/text.js";

let network: ReturnType<typeof spyOn>;
afterEach(() => network?.mockRestore());

function renderedSource(markdown: string) {
  const document = parseDocument(parse(markdown, { async: false }));
  const elements = Array.from(htmlElements(document));
  return {
    unsafeElements: elements.filter(element => ["script", "style", "img", "iframe", "svg", "math", "object", "embed", "form"].includes(element.name)
      || Object.keys(element.attribs).some(name => name.startsWith("on"))).map(element => element.name),
    links: elements.filter(element => element.name === "a").map(element => element.attribs.href),
    text: nodeToText(document),
  };
}

test.each([
  ["<b>Visible</b>", "Visible"],
  ["Visible <script", "Visible script"],
  ["Visible<script>alert(1)</script > after", "Visible after"],
  ["Visible<style>hidden</style > after", "Visible after"],
  ["Visible<!-- hidden --> after", "Visible after"],
  ["Visible<img src=x onerror=alert(1)> after", "Visible after"],
  ["Visible < 5 &amp; 7 > 2", "Visible < 5 & 7 > 2"],
  ["&lt;script&gt;literal&lt;/script&gt;", "<script>literal</script>"],
  ["&amp;lt;script&amp;gt;", "&lt;script&gt;"],
  ["<p>One</p><p>Two<br>Three</p>", "One\n\nTwo\n\nThree"],
])("HTML extraction parses once and preserves text: %s", (source, expected) => {
  expect(htmlToText(source)).toBe(expected);
});

test.each([
  "<script>alert(1)</script>",
  '<img src="https://example.test/tracker" onerror="alert(1)">',
  "![tracker](https://example.test/tracker) [click](javascript:alert(1))",
  "&lt;script&gt;literal&lt;/script&gt;",
  "Literal < 5 & 7 > 2",
  "[2022] KESC 8 | parties *name*",
  "https://example.test/x www.example.test person@example.test",
])("source text stays visible and inert after Markdown rendering: %s", source => {
  expect(renderedSource(escapeMarkdownText(source))).toEqual({ unsafeElements: [], links: [], text: source });
});

test("HTML fallback removes active/site content and protects encoded source text", () => {
  const result = parseAknXml('<HTML><TITLE>Fixture &lt;img src=x&gt; - Kenya Law</TITLE><BODY><HEADER>Site chrome</HEADER><MAIN class="akn-judgment"><p>Literal &lt;script&gt;alert(1)&lt;/script&gt; &amp;lt;img&amp;gt;</p><SCRIPT>hidden()</SCRIPT ><STYLE>hidden style</STYLE ><p>![tracker](https://example.test/x)</p></MAIN><FOOTER>Footer chrome</FOOTER></BODY></HTML>', "/akn/ke/judgment/kehc/2020/security");
  expect({ title: result.title, docType: result.docType, rendered: renderedSource(result.markdown) }).toEqual({
    title: "Fixture <img src=x>", docType: "judgment",
    rendered: { unsafeElements: [], links: [], text: "Fixture <img src=x>\n\nAKN URI: /akn/ke/judgment/kehc/2020/security\n\nLiteral <script>alert(1)</script> &lt;img&gt;\n\n![tracker](https://example.test/x)" },
  });
});

test("AKN CDATA, headings and metadata remain inert source text", () => {
  const result = parseAknXml('<akomaNtoso><act><meta><identification><FRBRWork><FRBRname value="Fixture &lt;img src=x&gt;"/></FRBRWork></identification></meta><body><section><num>1</num><heading>&lt;script&gt;heading&lt;/script&gt;</heading><p><![CDATA[<svg onload=alert(1)> [link](javascript:alert(1))]]></p></section></body></act></akomaNtoso>');
  expect(renderedSource(result.markdown)).toEqual({ unsafeElements: [], links: [], text: "Fixture <img src=x>\n\nOSCOLA Citation: Fixture <img src=x> (Kenya Law)\n\n1 <script>heading</script>\n\n<svg onload=alert(1)> [link](javascript:alert(1))" });
});

test("DOCX XML decodes entities once before Markdown output", () => {
  const text = htmlToText('<w:document><w:body><w:p><w:r><w:t>Literal &lt;img src=x&gt; &amp;lt;script&amp;gt; [click](javascript:alert(1))</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>', { xmlMode: true });
  expect(renderedSource(escapeMarkdownText(text))).toEqual({ unsafeElements: [], links: [], text: "Literal <img src=x> &lt;script&gt; [click](javascript:alert(1))\n\nSecond paragraph." });
});

test("section tool headers cannot reintroduce unsafe document metadata", async () => {
  network = spyOn(globalThis, "fetch").mockResolvedValue(new Response('<html><title>Fixture &lt;img src=x&gt;</title><main class="akn-act"><p>12. Duties</p><p>Source provision.</p><p>13. Offences</p><p>Next provision.</p></main></html>'));
  const result = await getAknDocument({ akn_url: "/akn/ke/act/2020/section-security/source", section: "12" });
  expect(renderedSource(result.content[0].text)).toEqual({ unsafeElements: [], links: [], text: "Fixture <img src=x> - Section/Article 12\n\nAKN URI: /akn/ke/act/2020/section-security/source\n\nDuties\n\nSource provision." });
});

test("cause-list JSON preserves literal text and its Markdown resource keeps it inert", async () => {
  const station = "Security <img src=x>";
  network = spyOn(globalThis, "fetch").mockResolvedValue(new Response('<table><tr><td>Fixture &lt;script&gt;</td><td>&lt;img src=x onerror=alert(1)&gt; ![tracker](https://example.test/x)<script>hidden()</script ></td><td></td><td></td><td>14:30</td></tr></table>'));
  const source = `https://new.kenyalaw.org/causelists/?q=${encodeURIComponent(station)}`;
  expect(await KenyaLawClient.getCauseList(station)).toEqual([{
    court_station: station, cause_number: "Fixture <script>", parties: "<img src=x onerror=alert(1)> ![tracker](https://example.test/x)",
    presiding_judge_coram: undefined, hearing_type: undefined, time: "14:30", source_url: source,
  }]);
  const response = await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: `kenyalaw://causelist/${station}` } });
  expect(renderedSource(response.result.contents[0].text)).toEqual({
    unsafeElements: [], links: [source],
    text: "Cause list search: Security <img src=x>\n\nConfirm dates and hearing details in the official source.\n\nFixture <script>: <img src=x onerror=alert(1)> ![tracker](https://example.test/x) (source)",
  });
});

test("link destinations cannot close a generated source link", () => {
  const source = "https://new.kenyalaw.org/akn/ke/act/2020/1)![tracker](https://example.test/x";
  expect(renderedSource(`[source](${markdownDestination(source)})`)).toEqual({
    unsafeElements: [], links: ["https://new.kenyalaw.org/akn/ke/act/2020/1%29!%5Btracker%5D%28https://example.test/x"], text: "source",
  });
});

test("deep HTML and repeated malformed tag prefixes do not require recursive extraction", () => {
  expect(htmlToText("<div>".repeat(10000) + "Visible" + "</div>".repeat(10000))).toBe("Visible");
  expect(htmlToText("<script".repeat(10000))).toBe("");
});

test("hidden containers cannot supply the selected document title or body", () => {
  const result = parseAknXml('<html><template><h1>Hidden title</h1><main class="akn-act">Hidden body</main></template><body><h1>Visible title</h1><main class="akn-act"><p>Visible body</p></main></body></html>');
  expect({ title: result.title, docType: result.docType, markdown: result.markdown }).toEqual({
    title: "Visible title", docType: "unknown", markdown: "# Visible title\n\nVisible body",
  });
});
