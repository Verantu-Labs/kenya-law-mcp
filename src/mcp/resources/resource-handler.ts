/**
 * src/mcp/resources/resource-handler.ts — MCP Resources & Resource Templates Handler.
 * Exposes canonical legal entities as read-only MCP resources for MCP clients.
 */

import { KenyaLawKnowledgeCore } from "../../domain/knowledge-core.js";
import { KenyaLawClient } from "../../client/kenyaLawClient.js";

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "kenyalaw://statute/{slug}",
    name: "Kenyan Statute Document",
    description: "Fetches full text Markdown and OSCOLA citations for a Kenyan Act of Parliament (e.g., kenyalaw://statute/employment-act-2007).",
    mimeType: "text/markdown",
  },
  {
    uriTemplate: "kenyalaw://case/{court}/{year}/{id}",
    name: "Kenyan Judicial Decision",
    description: "Fetches complete High Court, Court of Appeal, or Supreme Court judgment by case parameters.",
    mimeType: "text/markdown",
  },
  {
    uriTemplate: "kenyalaw://causelist/{station}",
    name: "Daily Court Cause List",
    description: "Fetches daily hearing list for a specific Kenyan court station (e.g., kenyalaw://causelist/milimani).",
    mimeType: "text/markdown",
  },
];

export const STATIC_RESOURCES = [
  {
    uri: "kenyalaw://statutes/constitution-2010",
    name: "Constitution of Kenya, 2010",
    description: "Supreme Law of the Republic of Kenya.",
    mimeType: "text/markdown",
  },
];

/**
 * Reads an MCP resource by URI.
 */
export async function readMcpResource(uri: string) {
  if (uri === "kenyalaw://statutes/constitution-2010") {
    const doc = await KenyaLawKnowledgeCore.getLegalObject("/akn/ke/act/2010/4");
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: doc.markdown,
        },
      ],
    };
  }

  if (uri.startsWith("kenyalaw://statute/")) {
    const slug = uri.replace("kenyalaw://statute/", "");
    const doc = await KenyaLawKnowledgeCore.getLegalObject(`/akn/ke/act/${slug}`);
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: doc.markdown,
        },
      ],
    };
  }

  if (uri.startsWith("kenyalaw://causelist/")) {
    const station = uri.replace("kenyalaw://causelist/", "").replace(/-/g, " ");
    const entries = await KenyaLawClient.getCauseList(station);
    const text = `# Daily Cause List — ${station.toUpperCase()}\n\n` +
      (entries.length > 0
        ? entries.map((e) => `- **${e.cause_number}**: ${e.parties} (${e.hearing_type} at ${e.time})`).join("\n")
        : "No cause list entries scheduled for today.");

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text,
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
}
