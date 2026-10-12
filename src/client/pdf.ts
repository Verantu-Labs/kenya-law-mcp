import { getDocumentProxy } from "unpdf";
import { escapeMarkdownText } from "../parsing/text.js";

export async function extractPdfDocument(bytes: Uint8Array): Promise<{ markdown: string; pageCount: number }> {
  // Parse bytes only: do not execute PDF actions or resolve document-supplied URLs.
  const document = await getDocumentProxy(bytes, { useSystemFonts: false, verbosity: 0 });
  try {
    if (document.numPages > 500) throw new Error("PDF exceeds the 500-page extraction limit.");
    const pages: string[] = [];
    // Sequential page reads keep peak work bounded on laptops and edge runtimes.
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")
        .join("").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim());
      page.cleanup();
    }
    if (!pages.some(text => text.trim())) throw new Error("PDF has no readable text layer; OCR is required.");
    return {
      markdown: pages.map((text, index) => `### Page ${index + 1}\n\n${text ? escapeMarkdownText(text) : "[No readable text on this page; OCR is required.]"}`).join("\n\n"),
      pageCount: document.numPages,
    };
  } finally {
    await document.loadingTask.destroy();
  }
}
