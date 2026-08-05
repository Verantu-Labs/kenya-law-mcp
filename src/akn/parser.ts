/**
 * akn/parser.ts — Robust Akoma Ntoso (AKN) XML to Markdown parser.
 * Converts Kenya Law AKN documents (<act>, <judgment>, <section>, <paragraph>)
 * into clean, non-truncated structured Markdown.
 */

import { XMLParser } from "fast-xml-parser";

export interface ParsedAknDocument {
  title: string;
  docType: "act" | "judgment" | "legal_notice" | "unknown";
  aknUrl?: string;
  publicationDate?: string;
  court?: string;
  oscolaCitation?: string;
  markdown: string;
  sectionsCount: number;
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
  if (xmlContent.includes("<!DOCTYPE html>") || (xmlContent.includes("<html") && !xmlContent.includes("<akomaNtoso"))) {
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
    markdownLines.push(`# ${title}\n`);
    if (oscolaCitation) {
      markdownLines.push(`**OSCOLA Citation**: \`${oscolaCitation}\`  `);
    }
    if (court) {
      markdownLines.push(`**Court**: ${court}  `);
    }
    if (publicationDate) {
      markdownLines.push(`**Date**: ${publicationDate}  `);
    }
    if (fallbackUrl) {
      markdownLines.push(`**AKN URI**: [${fallbackUrl}](${fallbackUrl})  `);
    }
    markdownLines.push("\n---\n");

    let sectionCounter = 0;
    if (bodyObj) {
      const { md, count } = renderElementToMarkdown(bodyObj);
      markdownLines.push(md);
      sectionCounter = count;
    } else {
      // Direct text fallback if body schema varies
      markdownLines.push(cleanXmlText(xmlContent));
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
  if (typeof node === "string") return { md: node, count: 0 };
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

  // Handle AKN tags
  const num = node.num ? (typeof node.num === "object" ? node.num["#text"] || "" : node.num) : "";
  const heading = node.heading ? (typeof node.heading === "object" ? node.heading["#text"] || "" : node.heading) : "";

  // Section / Article / Clause
  if (node.section || node.article || node.clause || node.paragraph) {
    const items = node.section || node.article || node.clause || node.paragraph;
    const itemList = Array.isArray(items) ? items : [items];

    for (const item of itemList) {
      count++;
      const itemNum = item.num ? (typeof item.num === "object" ? item.num["#text"] || "" : item.num) : "";
      const itemHead = item.heading ? (typeof item.heading === "object" ? item.heading["#text"] || "" : item.heading) : "";

      const headerPrefix = "#".repeat(Math.min(level + 1, 4));
      const titleLine = [itemNum, itemHead].filter(Boolean).join(" ");
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
      const pText = typeof p === "object" ? p["#text"] || renderElementToMarkdown(p, level).md : p;
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

  // Direct text node
  if (node["#text"]) {
    result += `${node["#text"]}\n`;
  }

  return { md: result.trim(), count };
}

/**
 * Fallback parser for HTML or non-standard text.
 */
function parseHtmlFallback(htmlContent: string, fallbackUrl?: string): ParsedAknDocument {
  // Strip tags and format headings cleanly
  const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i) || htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Kenyan Legal Document";

  const cleanText = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n### $1\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const markdown = `# ${title}\n\n${fallbackUrl ? `**AKN URI**: ${fallbackUrl}\n\n---\n\n` : ""}${cleanText}`;

  return {
    title,
    docType: "unknown",
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

function cleanXmlText(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
