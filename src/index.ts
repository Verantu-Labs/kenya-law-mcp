/**
 * kenya-law-mcp — High-Performance Stateless Akoma Ntoso (AKN) MCP Server.
 * Exposes deterministic Kenya statutes, case law, daily cause lists, and citators to AI agents.
 *
 * Transport: Stdio (spawned by local AI agents, Claude Desktop, Cursor, Windsurf, or Solon Desktop).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { getAknDocument } from "./tools/get-akn-document.js";
import { searchCaseLaw } from "./tools/search-case-law.js";
import { searchLegislation } from "./tools/search-legislation.js";
import { getCauseList } from "./tools/get-cause-list.js";
import { checkCitator } from "./tools/check-citator.js";
import { searchGazettes } from "./tools/search-gazettes.js";

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
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "get_akn_document":
        return getAknDocument(args as any);
      case "search_case_law":
        return searchCaseLaw(args as any);
      case "search_legislation":
        return searchLegislation(args as any);
      case "get_cause_list":
        return getCauseList(args as any);
      case "check_citator":
        return checkCitator(args as any);
      case "search_gazettes":
        return searchGazettes(args as any);
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool '${name}'. Available tools are: get_akn_document, search_case_law, search_legislation, get_cause_list, check_citator, search_gazettes.`,
            },
          ],
          isError: true,
        };
    }
  });

  return server;
}

/**
 * 2026-07-28 Stateless MCP Specification Handler.
 * Evaluates any JSON-RPC or header-routed request statelessly without initialization handshakes or session IDs.
 */
export async function handleStatelessMcpRequest(
  payload: any,
  headers?: Record<string, string>
): Promise<any> {
  const method = headers?.["mcp-method"] || payload?.method;
  const requestId = payload?.id ?? 1;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        protocolVersion: "2026-07-28",
        capabilities: { tools: {} },
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

  if (method === "tools/call") {
    const toolName = headers?.["mcp-name"] || payload?.params?.name;
    const toolArgs = payload?.params?.arguments || {};

    let toolResult: any;
    switch (toolName) {
      case "get_akn_document":
        toolResult = await getAknDocument(toolArgs);
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
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("dist/index.js")) {
  main().catch((err) => {
    console.error("Fatal error starting kenya-law-mcp server:", err);
    process.exit(1);
  });
}
