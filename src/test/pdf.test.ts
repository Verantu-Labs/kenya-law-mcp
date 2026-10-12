import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { KenyaLawClient } from "../client/kenyaLawClient.js";
import { getAknDocument } from "../tools/get-akn-document.js";
import { verifyCitation } from "../tools/verify-citation.js";

// Synthetic text only, with real PDF objects, compressed streams and xref offsets.
// No legal authority or downloaded client material is embedded in these fixtures.
function buildPdf(pageTexts: string[]): Uint8Array {
  const fontId = 3 + pageTexts.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`,
  ];
  for (const [index, text] of pageTexts.entries()) {
    const stream = deflateSync(Buffer.from(`BT /F1 12 Tf 50 700 Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n${stream.toString("latin1")}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("PDF document retrieval", () => {
  let network: ReturnType<typeof spyOn>;
  afterEach(() => network?.mockRestore());

  test("reads compressed text pages, preserves blank pages and does not invent metadata", async () => {
    const urls: string[] = [];
    network = spyOn(globalThis, "fetch").mockImplementation(async input => {
      urls.push(String(input));
      return new Response(buildPdf(["First synthetic page.", "", "Third synthetic page."]), { headers: { "content-type": "application/pdf" } });
    });
    const uri = "/akn/ke/bill/test/direct-pdf";
    expect(await KenyaLawClient.getAknDocument(uri)).toEqual({
      title: `Document ${uri}`, docType: "unknown", aknUrl: uri, sectionsCount: 0, pageCount: 3,
      markdown: `# Document ${uri}\n\n**AKN URI**: ${uri}\n\n### Page 1\n\nFirst synthetic page.\n\n### Page 2\n\n[No readable text on this page; OCR is required.]\n\n### Page 3\n\nThird synthetic page.`,
    });
    expect((await getAknDocument({ akn_url: uri })).isError).toBeUndefined();
    expect((await verifyCitation({ citation_string: uri })).isError).toBe(true);
    expect(urls).toEqual([`https://new.kenyalaw.org${uri}`]);
  });

  test("resolves a viewer's PDF source after a canonical expression redirect", async () => {
    const urls: string[] = [];
    const uri = "/akn/ke/judgment/kesc/2022/pdf-fixture";
    network = spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("pdf-fixture")) return new Response(null, { status: 302, headers: { location: `${uri}/eng@2022-01-01` } });
      if (url.endsWith("/source")) return new Response(buildPdf(["Readable synthetic source."]), { headers: { "content-type": "application/pdf" } });
      const response = new Response('<html><title>Fixture [2022] KESC 900001</title><div class="akn-judgment" data-display-type="pdf">Loading PDF</div></html>');
      Object.defineProperty(response, "url", { value: url });
      return response;
    });
    const doc = await KenyaLawClient.getAknDocument(uri);
    expect({ title: doc.title, pageCount: doc.pageCount, sectionsCount: doc.sectionsCount, markdown: doc.markdown }).toEqual({
      title: "Fixture [2022] KESC 900001", pageCount: 1, sectionsCount: 0,
      markdown: `# Fixture [2022] KESC 900001\n\n**AKN URI**: ${uri}\n\n### Page 1\n\nReadable synthetic source.`,
    });
    expect(urls).toEqual([`https://new.kenyalaw.org${uri}`, `https://new.kenyalaw.org${uri}/eng@2022-01-01`, `https://new.kenyalaw.org${uri}/eng@2022-01-01/source`]);
  });

  test.each(["scanned", "corrupt"])("unreadable %s PDFs are errors and do not poison the cache", async name => {
    const uri = `/akn/ke/bill/test/${name}`;
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response(name === "scanned"
      ? buildPdf([""]) : new TextEncoder().encode("%PDF-1.4 invalid"), { headers: { "content-type": "application/pdf" } }));
    const failed = await getAknDocument({ akn_url: uri });
    expect(failed.isError).toBe(true);
    if (name === "scanned") expect(failed.content[0].text).toContain("OCR is required");
    network.mockImplementation(async () => new Response(buildPdf(["Readable retry."])));
    const retry = await getAknDocument({ akn_url: uri });
    expect(retry.isError).toBeUndefined();
    expect(retry.content[0].text).toContain("Readable retry.");
  });

  test("a large viewer shell cannot become a readable authority when its source fails", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async input => /\/source(?:\.pdf)?$/.test(String(input))
      ? new Response("unavailable", { status: 500 })
      : new Response(`<html><title>Fixture shell</title><div class="akn-judgment" data-display-type="pdf">${"Metadata only. ".repeat(100)}</div></html>`));
    const result = await getAknDocument({ akn_url: "/akn/ke/judgment/kesc/2022/shell-only" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("full source could not be read");
  });

  test("retains official source.pdf fallback when the source endpoint is unavailable", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async input => String(input).endsWith("/source.pdf")
      ? new Response(buildPdf(["Synthetic source.pdf fallback."]))
      : String(input).endsWith("/source") ? new Response("missing", { status: 404 })
      : new Response('<html><title>Fixture fallback</title><div class="akn-judgment" data-display-type="pdf">Loading PDF</div></html>'));
    const result = await getAknDocument({ akn_url: "/akn/ke/judgment/kesc/2022/source-pdf-fallback" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Synthetic source.pdf fallback.");
  });

  test.each(["header", "stream"])("rejects oversized document %s before parsing", async mode => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => mode === "header"
      ? new Response("small body", { headers: { "content-length": String(21 * 1024 * 1024) } })
      : new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(11 * 1024 * 1024));
        controller.enqueue(new Uint8Array(11 * 1024 * 1024));
        controller.close();
      } })));
    const result = await getAknDocument({ akn_url: `/akn/ke/bill/test/large-${mode}` });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("20 MiB download limit");
  });

  test("rejects a document above the PDF page limit", async () => {
    network = spyOn(globalThis, "fetch").mockImplementation(async () => new Response(buildPdf(Array.from({ length: 501 }, () => "Synthetic page."))));
    const result = await getAknDocument({ akn_url: "/akn/ke/bill/test/page-limit" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500-page extraction limit");
  });
});
