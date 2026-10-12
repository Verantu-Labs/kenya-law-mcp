/**
 * akn/parser.ts - Robust Akoma Ntoso (AKN) XML to Markdown parser.
 * Converts Kenya Law AKN documents (<act>, <judgment>, <section>, <paragraph>)
 * into clean, non-truncated structured Markdown.
 */

import { XMLParser } from "fast-xml-parser";
import { parseDocument } from "htmlparser2";
import { escapeMarkdownText, htmlElements, markdownDestination, nodeToText } from "../parsing/text.js";

export interface ParsedAknDocument {
  title: string;
  docType: "act" | "judgment" | "legal_notice" | "unknown";
  aknUrl?: string;
  publicationDate?: string;
  court?: string;
  oscolaCitation?: string;
  markdown: string;
  sectionsCount: number;
  pageCount?: number;
}

/**
 * Parses raw Akoma Ntoso XML (or HTML fallback) into a structured Markdown document.
 */
export function parseAknXml(xmlContent: string, fallbackUrl?: string): ParsedAknDocument {
  if (!xmlContent || xmlContent.trim().length === 0) {
    return {
      title: "Empty Document",
      docType: "unknown",
      markdown: "_No content available for this AKN URI._",
      sectionsCount: 0,
    };
  }

  // Fast check: If document is raw HTML fallback rather than AKN XML
  if (/<!doctype\s+html|<html(?:\s|>)/i.test(xmlContent) && !xmlContent.includes("<akomaNtoso")) {
    return parseHtmlFallback(xmlContent, fallbackUrl);
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
      preserveOrder: false,
    });

    const jsonObj = parser.parse(xmlContent);
    const root = jsonObj.akomaNtoso || jsonObj;

    // Detect Document Type (<act>, <judgment>, <doc>)
    let docType: ParsedAknDocument["docType"] = "unknown";
    let bodyObj: any = null;
    let metaObj: any = null;

    if (root.act) {
      docType = "act";
      bodyObj = root.act.body || root.act.mainBody;
      metaObj = root.act.meta;
    } else if (root.judgment) {
      docType = "judgment";
      bodyObj = root.judgment.judgmentBody || root.judgment.body;
      metaObj = root.judgment.meta;
    } else if (root.doc) {
      docType = "legal_notice";
      bodyObj = root.doc.mainBody || root.doc.body;
      metaObj = root.doc.meta;
    } else {
      bodyObj = root;
    }

    // Extract Title & Metadata
    const title = extractTitle(metaObj, root) || "Kenyan Legal Document";
    const oscolaCitation = extractOscolaCitation(metaObj, root, title, fallbackUrl);
    const court = extractCourt(metaObj, root);
    const publicationDate = extractDate(metaObj);

    // Convert XML Body to Structured Markdown
    const markdownLines: string[] = [];
    markdownLines.push(`# ${escapeMarkdownText(title)}\n`);
    if (oscolaCitation) {
      markdownLines.push(`**OSCOLA Citation**: ${escapeMarkdownText(oscolaCitation)}  `);
    }
    if (court) {
      markdownLines.push(`**Court**: ${escapeMarkdownText(court)}  `);
    }
    if (publicationDate) {
      markdownLines.push(`**Date**: ${escapeMarkdownText(publicationDate)}  `);
    }
    if (fallbackUrl) {
      markdownLines.push(`**AKN URI**: [${escapeMarkdownText(fallbackUrl)}](${markdownDestination(fallbackUrl)})  `);
    }
    markdownLines.push("\n---\n");

    let sectionCounter = 0;
    if (bodyObj) {
      const { md, count } = renderElementToMarkdown(bodyObj);
      markdownLines.push(md);
      sectionCounter = count;
      if (!md.trim()) docType = "unknown";
    } else {
      // Metadata without a recognized body cannot establish readable legal text.
      docType = "unknown";
    }

    return {
      title,
      docType,
      aknUrl: fallbackUrl,
      publicationDate: publicationDate || undefined,
      court: court || undefined,
      oscolaCitation: oscolaCitation || undefined,
      markdown: markdownLines.join("\n"),
      sectionsCount: sectionCounter,
    };
  } catch (_err) {
    // Fallback to regex-based extraction if XML parsing throws a syntax error
    return parseHtmlFallback(xmlContent, fallbackUrl);
  }
}

/**
 * Renders an AKN XML element node recursively into clean Markdown text.
 */
function renderElementToMarkdown(node: any, level = 1): { md: string; count: number } {
  if (!node) return { md: "", count: 0 };
  if (typeof node === "string") return { md: escapeMarkdownText(node), count: 0 };
  if (typeof node === "number" || typeof node === "boolean") return { md: String(node), count: 0 };

  let result = "";
  let count = 0;

  if (Array.isArray(node)) {
    for (const item of node) {
      const sub = renderElementToMarkdown(item, level);
      result += sub.md + "\n\n";
      count += sub.count;
    }
    return { md: result.trim(), count };
  }

  // Section / Article / Clause
  if (node.section || node.article || node.clause || node.paragraph || node.subsection || node.subparagraph) {
    const items = node.section || node.article || node.clause || node.paragraph || node.subsection || node.subparagraph;
    const itemList = Array.isArray(items) ? items : [items];

    for (const item of itemList) {
      count++;
      const itemNum = item.num ? (typeof item.num === "object" ? item.num["#text"] || "" : item.num) : "";
      const itemHead = item.heading ? (typeof item.heading === "object" ? item.heading["#text"] || "" : item.heading) : "";

      const headerPrefix = "#".repeat(Math.min(level + 1, 4));
      const titleLine = [itemNum, itemHead].filter(Boolean).map(value => escapeMarkdownText(String(value))).join(" ");
      if (titleLine) {
        result += `\n${headerPrefix} ${titleLine}\n\n`;
      }

      const content = renderElementToMarkdown(item, level + 1);
      result += content.md + "\n";
    }
  }

  // Paragraph / Body Text
  if (node.p) {
    const pList = Array.isArray(node.p) ? node.p : [node.p];
    for (const p of pList) {
      const pText = typeof p === "object" ? (p["#text"] ? escapeMarkdownText(String(p["#text"])) : renderElementToMarkdown(p, level).md) : escapeMarkdownText(String(p));
      if (pText && String(pText).trim()) {
        result += `${String(pText).trim()}\n\n`;
      }
    }
  }

  // Intro / WrapUp
  if (node.intro) {
    result += `${renderElementToMarkdown(node.intro, level).md}\n\n`;
  }
  if (node.wrapUp) {
    result += `${renderElementToMarkdown(node.wrapUp, level).md}\n\n`;
  }
  if (node.content) {
    result += `${renderElementToMarkdown(node.content, level).md}\n\n`;
  }

  // Direct text node
  if (node["#text"]) {
    result += `${escapeMarkdownText(String(node["#text"]))}\n`;
  }

  return { md: result.trim(), count };
}

function parseHtmlFallback(htmlContent: string, fallbackUrl?: string): ParsedAknDocument {
  const document = parseDocument(htmlContent);
  const elements = Array.from(htmlElements(document, { excludeNonContent: true }));
  const titleNode = elements.find(element => element.name === "title")
    ?? elements.find(element => element.name === "h1");
  const title = (titleNode ? nodeToText(titleNode) : "Kenyan Legal Document").replace(/\s+-\s+Kenya Law$/i, "").trim();
  // Select complete source containers, not a regex slice that can include site
  // chrome or be confused by quoted attributes and malformed closing tags.
  const sourceNode = elements.find(element => (element.attribs.class ?? "").split(/\s+/)
    .some(name => ["akn-akomaNtoso", "akn-act", "akn-judgment", "akn-document", "judgment", "act-body", "content-container"].includes(name)))
    ?? elements.find(element => element.name === "main")
    ?? elements.find(element => element.name === "article")
    ?? elements.find(element => element.name === "body")
    ?? document;
  const cleanText = nodeToText(sourceNode);

  const lowerUrl = (fallbackUrl || "").toLowerCase();
  const hasDocumentMarkup = elements.some(element => (element.attribs.class ?? "").split(/\s+/)
    .some(name => ["akn-akomaNtoso", "akn-act", "akn-judgment", "akn-document"].includes(name)));
  const docType: ParsedAknDocument["docType"] = !hasDocumentMarkup || !cleanText ? "unknown" :
    lowerUrl.includes("/act/") || cleanText.includes("LAWS OF KENYA")
      ? "act"
      : (lowerUrl.includes("/judgment/") || cleanText.includes("JUDGMENT") || cleanText.includes("RULING") ? "judgment" : "unknown");

  const markdown = `# ${escapeMarkdownText(title)}\n\n${fallbackUrl ? `**AKN URI**: ${escapeMarkdownText(fallbackUrl)}\n\n---\n\n` : ""}${escapeMarkdownText(cleanText)}`;

  return {
    title,
    docType,
    aknUrl: fallbackUrl,
    markdown,
    sectionsCount: 1,
  };
}

function extractTitle(metaObj: any, root: any): string | null {
  if (metaObj?.identification?.FRBRWork?.FRBRname?.["@_value"]) {
    return metaObj.identification.FRBRWork.FRBRname["@_value"];
  }
  if (root?.act?.meta?.identification?.FRBRWork?.FRBRtitle?.["@_value"]) {
    return root.act.meta.identification.FRBRWork.FRBRtitle["@_value"];
  }
  return null;
}

function extractOscolaCitation(metaObj: any, _root: any, title: string, fallbackUrl?: string): string | null {
  if (metaObj?.publication?.["@_name"]) {
    return metaObj.publication["@_name"];
  }
  if (fallbackUrl) {
    const citMatch = fallbackUrl.match(/\[\d{4}\]\s+(?:eKLR|KE[A-Z]+\s+\d+)/i);
    if (citMatch) return citMatch[0];
  }
  return `${title} (Kenya Law)`;
}

function extractCourt(metaObj: any, _root: any): string | null {
  if (metaObj?.classification?.keyword) {
    const kw = metaObj.classification.keyword;
    if (typeof kw === "object" && kw["@_value"]) return kw["@_value"];
  }
  return null;
}

function extractDate(metaObj: any): string | null {
  if (metaObj?.identification?.FRBRWork?.FRBRdate?.["@_date"]) {
    return metaObj.identification.FRBRWork.FRBRdate["@_date"];
  }
  return null;
}
