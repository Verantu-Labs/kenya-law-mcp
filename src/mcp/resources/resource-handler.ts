/**
 * src/mcp/resources/resource-handler.ts — MCP Resources & Resource Templates Handler.
 * Exposes canonical legal entities as read-only MCP resources for MCP clients.
 */

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
  if (typeof uri !== "string") throw new Error("A resource URI is required.");
  let identifier: string | undefined;
  if (uri === "kenyalaw://statutes/constitution-2010") {
    identifier = "/akn/ke/act/2010/constitution/eng@2010-09-03";
  } else if (uri.startsWith("kenyalaw://case/")) {
    const match = uri.match(/^kenyalaw:\/\/case\/(ke[a-z]+)\/(\d{4})\/(\d+)$/i);
    if (!match) throw new Error("Use kenyalaw://case/{court}/{year}/{id}.");
    identifier = `/akn/ke/judgment/${match[1]!.toLowerCase()}/${match[2]}/${match[3]}`;
  } else if (uri.startsWith("kenyalaw://statute/")) {
    const slug = uri.slice("kenyalaw://statute/".length);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid statute slug.");
    const year = slug.match(/-(\d{4})$/)?.[1];
    const name = slug.replace(/-\d{4}$/, "").replace(/-/g, " ");
    const candidates = await KenyaLawClient.searchLegislation(name, 50);
    const matches = candidates.filter(record => record.short_title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === name
      && (!year || record.year === Number(year)));
    if (matches.length !== 1) throw new Error("Statute slug did not resolve uniquely. Search legislation and retrieve its AKN URL.");
    identifier = matches[0]!.akn_url;
  } else if (uri.startsWith("kenyalaw://causelist/")) {
    const station = uri.slice("kenyalaw://causelist/".length).replace(/-/g, " ");
    if (!station.trim()) throw new Error("A court station is required.");
    const entries = await KenyaLawClient.getCauseList(station);
    return { contents: [{ uri, mimeType: "text/markdown",
      text: `# Cause list search: ${station}\n\nConfirm dates and hearing details in the official source.\n\n`
        + (entries.length ? entries.map(entry => `- **${entry.cause_number}**: ${entry.parties} ([source](${entry.source_url}))`).join("\n")
          : "No entries were extracted; this does not establish that no hearings are scheduled."),
    }] };
  }
  if (!identifier) throw new Error(`Resource not found: ${uri}`);
  const doc = await KenyaLawClient.getAknDocument(identifier);
  return { contents: [{ uri, mimeType: "text/markdown", text: doc.markdown }] };
}
