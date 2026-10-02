#!/usr/bin/env node
/**
 * kenya-law-mcp - High-Performance Stateless Akoma Ntoso (AKN) MCP Server.
 * Exposes Kenya statutes, case law, daily cause lists, and citators directly to AI agents.
 */

import { Server, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, ProtocolError } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { ToolSchema } from "@modelcontextprotocol/core";
import { pathToFileURL } from "node:url";

export type Tool = typeof ToolSchema._output;

import { getAknDocument } from "./tools/get-akn-document.js";
import { searchCaseLaw } from "./tools/search-case-law.js";
import { searchLegislation } from "./tools/search-legislation.js";
import { getCauseList } from "./tools/get-cause-list.js";
import { checkCitator } from "./tools/check-citator.js";
import { searchGazettes } from "./tools/search-gazettes.js";
import { verifyCitation } from "./tools/verify-citation.js";
import { getDocumentsBulk } from "./tools/get-documents-bulk.js";

export {
  getAknDocument,
  searchCaseLaw,
  searchLegislation,
  getCauseList,
  checkCitator,
  searchGazettes,
  verifyCitation,
  getDocumentsBulk,
};

import { RESOURCE_TEMPLATES, STATIC_RESOURCES, readMcpResource } from "./mcp/resources/resource-handler.js";

export { KenyaLawClient } from "./client/kenyaLawClient.js";
export { parseAknXml } from "./akn/parser.js";

export const TOOLS: Tool[] = [
  {
    name: "get_akn_document",
    description:
      "Fetches a raw Akoma Ntoso (AKN) legal document (Act, Judgment, or Legal Notice) or court judgment directory (e.g. /judgments/KESC/2022/) by AKN URI or URL, converting XML/HTML into structured non-truncated Markdown with OSCOLA citations.",
    inputSchema: {
      type: "object",
      properties: {
        akn_url: {
          type: "string",
          description: "The Akoma Ntoso URI or URL (e.g. '/akn/ke/act/2010/4' or '/judgments/KESC/2022/')",
        },
        section: {
          type: "string",
          description: "Optional section number to extract directly (e.g. '12' or 'Section 12')",
        },
        article: {
          type: "string",
          description: "Optional article number to extract directly for constitutions (e.g. '1', '2', '22')",
        },
      },
      required: ["akn_url"],
    },
  },
  {
    name: "get_documents_bulk",
    description:
      "Fetches up to 10 Akoma Ntoso (AKN) legal documents in parallel in a single API call to save context tokens and round-trips.",
    inputSchema: {
      type: "object",
      properties: {
        akn_urls: {
          type: "array",
          items: { type: "string" },
          description: "Array of up to 10 Akoma Ntoso URIs or URLs to fetch",
        },
      },
      required: ["akn_urls"],
    },
  },
  {
    name: "search_case_law",
    description:
      "Stateless real-time search across Kenyan Courts (Supreme Court KESC, Court of Appeal KECA, High Court KEHC, Environment & Land Court KEELC, Employment & Labour Relations Court KEELRC, Tribunals). Supports keyword search, citations, or court and year directory queries (e.g. court: 'KESC', year: 2022). Returns AKN URIs, case names, and citations.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Legal issue or search keywords (e.g. 'unfair termination' or 'Supreme Court 2022'). Optional if court and year are provided.",
        },
        court: {
          type: "string",
          description: "Court code or name (e.g. 'KESC', 'KECA', 'KEHC', 'KEELRC', 'Supreme Court', 'Court of Appeal')",
        },
        court_code: {
          type: "string",
          description: "Court acronym alias (e.g. 'KESC', 'KECA', 'KEHC')",
        },
        court_station: {
          type: "string",
          description: "Court station filter (e.g. 'Meru' or 'High Court at Meru').",
        },
        month: {
          type: "number",
          description: "Decision month number (1-12) when querying a station directory.",
        },
        year: {
          type: "number",
          description: "Specific judgment year (e.g. 2022)",
        },
        year_from: {
          type: "number",
          description: "Filter judgments delivered on or after this year (e.g. 2020)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
      },
    },
  },
  {
    name: "search_legislation",
    description:
      "Stateless search across Kenya Acts of Parliament and Legal Notices index (/akn/ke/act/). Returns AKN URIs to active revised statutes.",
    inputSchema: {
      type: "object",
      properties: {
        act_name: {
          type: "string",
          description: "Name or abbreviation of Act (e.g. 'Employment Act' or 'Data Protection')",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
      },
      required: ["act_name"],
    },
  },
  {
    name: "get_cause_list",
    description:
      "Retrieves daily court cause lists by court station (e.g. 'Milimani Law Courts', 'Mombasa', 'Eldoret') and date. Essential for litigators preparing for court hearings.",
    inputSchema: {
      type: "object",
      properties: {
        court_station: {
          type: "string",
          description: "Court station name (e.g. 'Milimani Law Courts' or 'High Court at Eldoret')",
        },
        date: {
          type: "string",
          description: "Hearing date in YYYY-MM-DD format (defaults to current date)",
        },
      },
      required: ["court_station"],
    },
  },
  {
    name: "check_citator",
    description:
      "Checks whether an official judgment can be retrieved. Subsequent treatment is not checked; this cannot establish good-law status.",
    inputSchema: {
      type: "object",
      properties: {
        case_akn_url: {
          type: "string",
          description: "The AKN URI or neutral citation of the target case",
        },
      },
      required: ["case_akn_url"],
    },
  },
  {
    name: "verify_citation",
    description:
      "Verifies whether a legal citation string or neutral citation exists on Kenya Law, grounding LLM output and preventing hallucinations.",
    inputSchema: {
      type: "object",
      properties: {
        citation_string: {
          type: "string",
          description: "The citation to verify (e.g. '[2022] KESC 8' or 'Employment Act')",
        },
      },
      required: ["citation_string"],
    },
  },
  {
    name: "search_gazettes",
    description:
      "Stateless real-time search across official Kenya Gazette notices (land title notices, government appointments, probate notices, tribunal decisions).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword or gazette notice issue (e.g. 'gazette notice land title' or 'probate')",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10, max: 50)",
        },
      },
      required: ["query"],
    },
  },
];

export function createMcpServer() {
  const server = new Server(
    {
      name: "kenya-law-mcp",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  server.setRequestHandler("tools/list", async () => {
    return { tools: TOOLS };
  });

  // Both transports dispatch through the same handlers and expose the same capabilities.
  for (const method of ["tools/call", "resources/list", "resources/templates/list", "resources/read", "prompts/list", "prompts/get"] as const) {
    server.setRequestHandler(method, async request => {
      const response = await handleStatelessMcpRequest({ jsonrpc: "2.0", id: 1, ...request });
      if (response.error) throw new ProtocolError(response.error.code, response.error.message);
      return response.result;
    });
  }

  return server;
}

export const PROMPTS = [
  {
    name: "research_case_precedent",
    title: "Research Kenyan Case Precedent",
    description: "Guides the LLM through searching case law, fetching full AKN judgments, reporting the limits of treatment checking, and formatting OSCOLA citations.",
    arguments: [
      {
        name: "issue",
        description: "The legal issue or query to research (e.g., 'unfair termination of employment')",
        required: true,
      },
      {
        name: "court",
        description: "Optional court filter (e.g., 'KESC', 'KECA', 'KEHC', 'KEELRC')",
        required: false,
      },
    ],
  },
  {
    name: "verify_legal_citation",
    title: "Verify Kenyan Citation & Fetch Document",
    description: "Verifies a Kenyan case or statute citation against Kenya Law database and retrieves the full text if verified.",
    arguments: [
      {
        name: "citation_string",
        description: "The citation to verify (e.g., '[2026] KEHC 12536' or 'Employment Act')",
        required: true,
      },
    ],
  },
  {
    name: "analyze_statute_section",
    title: "Analyze Kenyan Statute & Section",
    description: "Searches for an Act of Parliament, retrieves its Akoma Ntoso structure, and analyzes specific section provisions.",
    arguments: [
      {
        name: "act_name",
        description: "Name of the Act (e.g. 'Employment Act' or 'Data Protection')",
        required: true,
      },
    ],
  },
];

export async function handleStatelessMcpRequest(
  payload: any
): Promise<any> {
  if (!payload || Array.isArray(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string"
    || (payload.id !== undefined && typeof payload.id !== "number" && typeof payload.id !== "string")
    || (payload.params !== undefined && (!payload.params || typeof payload.params !== "object" || Array.isArray(payload.params)))) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } };
  }
  if (payload.id === undefined) return null;
  const method = payload.method;
  const requestId = payload.id;
  if (method === "ping") return { jsonrpc: "2.0", id: requestId, result: {} };

  if (method === "initialize") {
    // Negotiate only protocol versions implemented by the installed MCP SDK.
    const requestedVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(payload?.params?.protocolVersion)
      ? payload.params.protocolVersion : LATEST_PROTOCOL_VERSION;
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        protocolVersion: requestedVersion,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: {
          name: "kenya-law-mcp",
          version: "0.2.0",
        },
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: { tools: TOOLS },
    };
  }

  if (method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: { resources: STATIC_RESOURCES },
    };
  }

  if (method === "resources/templates/list") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: { resourceTemplates: RESOURCE_TEMPLATES },
    };
  }

  if (method === "resources/read") {
    const uri = payload?.params?.uri;
    try {
      const res = await readMcpResource(uri);
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: res,
      };
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -32602, message: err?.message || `Resource error for ${uri}` },
      };
    }
  }

  if (method === "prompts/list") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        resultType: "complete",
        prompts: PROMPTS,
      },
    };
  }

  if (method === "prompts/get") {
    const promptName = payload?.params?.name;
    const args = payload?.params?.arguments || {};

    if (promptName === "research_case_precedent") {
      const issue = args.issue || "legal issue";
      const courtStr = args.court ? ` in the ${args.court}` : "";
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          resultType: "complete",
          description: "Research Kenyan Case Precedent",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please conduct comprehensive Kenyan case law research on '${issue}'${courtStr}.\n\nFollow these steps:\n1. Use \`search_case_law\` to find relevant precedents for '${issue}'.\n2. Use \`get_akn_document\` or \`get_documents_bulk\` to fetch the full text of top matching judgments.\n3. Report that subsequent treatment is not checked by \`check_citator\` for key cases.\n4. Provide a structured legal analysis with proper OSCOLA citations.`,
              },
            },
          ],
        },
      };
    }

    if (promptName === "verify_legal_citation") {
      const citation = args.citation_string || "citation";
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          resultType: "complete",
          description: "Verify Kenyan Citation",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please verify the Kenyan legal citation '${citation}':\n\n1. Call \`verify_citation\` with citation_string '${citation}'.\n2. If verified, call \`get_akn_document\` using the returned \`akn_url\` to inspect the official text.\n3. Report whether an official record was retrieved, without asserting current legal validity and provide the full title and citation summary.`,
              },
            },
          ],
        },
      };
    }

    if (promptName === "analyze_statute_section") {
      const act = args.act_name || "Act";
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          resultType: "complete",
          description: "Analyze Kenyan Statute",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please analyze the Kenyan statute '${act}':\n\n1. Call \`search_legislation\` for '${act}'.\n2. Use \`get_akn_document\` with the returned \`akn_url\` to fetch the active statute content.\n3. Provide a clear section-by-section breakdown of key rights, obligations, and penalties.`,
              },
            },
          ],
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: requestId,
      error: { code: -32602, message: `Prompt not found: ${promptName}` },
    };
  }

  if (method === "tools/call") {
    const toolName = payload?.params?.name;
    const toolArgs = payload?.params?.arguments || {};

    let toolResult: any;
    try {
      switch (toolName) {
        case "get_akn_document":
          toolResult = await getAknDocument(toolArgs);
          break;
        case "get_documents_bulk":
          toolResult = await getDocumentsBulk(toolArgs);
          break;
        case "search_case_law":
          toolResult = await searchCaseLaw(toolArgs);
          break;
        case "search_legislation":
          toolResult = await searchLegislation(toolArgs);
          break;
        case "get_cause_list":
          toolResult = await getCauseList(toolArgs);
          break;
        case "check_citator":
          toolResult = await checkCitator(toolArgs);
          break;
        case "verify_citation":
          toolResult = await verifyCitation(toolArgs);
          break;
        case "search_gazettes":
          toolResult = await searchGazettes(toolArgs);
          break;
        default:
          return {
            jsonrpc: "2.0",
            id: requestId,
            error: { code: -32601, message: `Method or tool not found: ${toolName}` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          content: [{ type: "text", text: `Tool Execution Error: ${err?.message || err}` }],
          isError: true,
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: requestId,
      result: toolResult,
    };
  }

  return {
    jsonrpc: "2.0",
    id: requestId,
    error: { code: -32601, message: `Unsupported method: ${method}` },
  };
}

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start stdio listener if executed directly via CLI
declare const process: { argv?: string[]; exit?: (code?: number) => void } | undefined;
if (import.meta.main || (typeof process !== "undefined" && process?.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  main().catch((err) => {
    console.error("Fatal error starting Kenya Law MCP server:", err);
    process?.exit?.(1);
  });
}
