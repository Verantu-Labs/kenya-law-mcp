import { createMcpServer, handleStatelessMcpRequest, TOOLS } from "./index.js";
import { LATEST_PROTOCOL_VERSION, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import openapiSchema from "../openapi.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Accept",
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // This public read-only Worker accepts HTTPS browser origins. Reject opaque,
    // malformed and insecure origins; local stdio does not expose an HTTP listener.
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "https:" || parsed.origin !== origin) return new Response("Invalid Origin", { status: 403 });
      } catch {
        return new Response("Invalid Origin", { status: 403 });
      }
    }

    // Handle CORS preflight options
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Serve OpenAPI JSON schema for ChatGPT Custom GPT Actions & integrations
    if (url.pathname === "/openapi.json" || url.pathname === "/openapi" || url.pathname === "/openapi.yaml") {
      return new Response(JSON.stringify(openapiSchema, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // Health check endpoint
    if (url.pathname === "/health" || (url.pathname === "/" && request.method === "GET")) {
      return new Response(
        JSON.stringify({
          status: "online",
          specVersion: LATEST_PROTOCOL_VERSION,
          server: "kenya-law-mcp",
          version: "0.2.0",
          runtime: "Cloudflare Workers",
          tools: TOOLS.map((t) => t.name),
          openapi: "/openapi.json",
        }),
        {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // REST endpoints for OpenAPI / ChatGPT Custom GPT Actions (/api/v1/:toolName)
    if (request.method === "POST" && url.pathname.startsWith("/api/v1/")) {
      const toolName = url.pathname.replace("/api/v1/", "").trim();
      try {
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("Expected a JSON object", { status: 400, headers: CORS_HEADERS });

        const responseJson = await handleStatelessMcpRequest(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: toolName, arguments: body },
          }
        );

        if (responseJson?.error) {
          return new Response(JSON.stringify(responseJson.error), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        // Return tool output content directly for REST/OpenAPI client
        return new Response(JSON.stringify(responseJson?.result ?? responseJson), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: `Internal execution error: ${err?.message || err}` }),
          {
            status: err instanceof SyntaxError ? 400 : 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          }
        );
      }
    }

    if (url.pathname !== "/" && url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response("No server event stream is available", { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } });
    }
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      return new Response(response.body, { status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...CORS_HEADERS } });
    } finally {
      await server.close();
    }
  },
};
