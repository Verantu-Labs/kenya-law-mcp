/**
 * kenya-law-mcp — High-Performance Stateless Akoma Ntoso (AKN) MCP Server.
 * Exposes Kenya statutes, case law, daily cause lists, and citators directly to AI agents.
 */

import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { ToolSchema } from "@modelcontextprotocol/core";
import { z } from "zod";

export type Tool = z.infer<typeof ToolSchema>;

import { getAknDocument } from "./tools/get-akn-document.js";
import { searchCaseLaw } from "./tools/search-case-law.js";
import { searchLegislation } from "./tools/search-legislation.js";
import { getCauseList } from "./tools/get-cause-list.js";
import { checkCitator } from "./tools/check-citator.js";
import { searchGazettes } from "./tools/search-gazettes.js";
import { verifyCitation } from "./tools/verify-citation.js";
import { getDocumentsBulk } from "./tools/get-documents-bulk.js";

import { RESOURCE_TEMPLATES, STATIC_RESOURCES, readMcpResource } from "./mcp/resources/resource-handler.js";

export { KenyaLawClient } from "./client/kenyaLawClient.js";
export { parseAknXml } from "./akn/parser.js";

export const TOOLS: Tool[] = [
  {
    name: "get_akn_document",
    description:
      "Fetches a raw Akoma Ntoso (AKN) legal document (Act, Judgment, or Legal Notice) by AKN URI or URL, converting XML tags into structured non-truncated Markdown with OSCOLA citations.",
    inputSchema: {
      type: "object",
      properties: {
        akn_url: {
          type: "string",
          description: "The Akoma Ntoso URI or URL (e.g. '/akn/ke/act/2010/4' or '/akn/ke/judgment/kehc/2026/8198')",
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
      "Stateless real-time search across Kenyan High Court, Court of Appeal, and Supreme Court judgments. Returns AKN URIs, case names, and neutral citations.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Legal issue or search keywords (e.g. 'unfair termination of employment')",
        },
        court: {
          type: "string",
          description: "Court level filter (e.g. 'KESC', 'KECA', 'KEHC', 'KEELRC')",
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
      required: ["query"],
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
      "Extracts subsequent history and citing references for a precedent (Is it still good law? Check followed, distinguished, or overruled status).",
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
      },
    }
  );

  server.setRequestHandler("tools/list", async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler("tools/call", async (request, _ctx) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "get_akn_document":
        return getAknDocument(args as any);
      case "get_documents_bulk":
        return getDocumentsBulk(args as any);
      case "search_case_law":
        return searchCaseLaw(args as any);
      case "search_legislation":
        return searchLegislation(args as any);
      case "get_cause_list":
        return getCauseList(args as any);
      case "check_citator":
        return checkCitator(args as any);
      case "verify_citation":
        return verifyCitation(args as any);
      case "search_gazettes":
        return searchGazettes(args as any);
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool '${name}'. Available tools are: ${TOOLS.map((t) => t.name).join(", ")}.`,
            },
          ],
          isError: true,
        };
    }
  });

  return server;
}

export const PROMPTS = [
  {
    name: "research_case_precedent",
    title: "Research Kenyan Case Precedent",
    description: "Guides the LLM through searching case law, fetching full AKN judgments, verifying precedent treatment, and formatting OSCOLA citations.",
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
  payload: any,
  headers?: Record<string, string>
): Promise<any> {
  const method = headers?.["mcp-method"] || payload?.method;
  const requestId = payload?.id ?? 1;

  if (method === "initialize") {
    // Return the protocol version requested by the client or default to latest "2026-07-28"
    const requestedVersion = payload?.params?.protocolVersion || "2026-07-28";
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
                text: `Please conduct comprehensive Kenyan case law research on '${issue}'${courtStr}.\n\nFollow these steps:\n1. Use \`search_case_law\` to find relevant precedents for '${issue}'.\n2. Use \`get_akn_document\` or \`get_documents_bulk\` to fetch the full text of top matching judgments.\n3. Check precedent treatment using \`check_citator\` for key cases.\n4. Provide a structured legal analysis with proper OSCOLA citations.`,
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
                text: `Please verify the Kenyan legal citation '${citation}':\n\n1. Call \`verify_citation\` with citation_string '${citation}'.\n2. If verified, call \`get_akn_document\` using the returned \`akn_url\` to inspect the official text.\n3. Confirm whether it is valid law and provide the full title and citation summary.`,
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
    const toolName = headers?.["mcp-name"] || payload?.params?.name;
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error starting Kenya Law MCP server:", err);
    process.exit(1);
  });
}
