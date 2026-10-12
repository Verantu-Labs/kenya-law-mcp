import { createMcpServer, handleStatelessMcpRequest, TOOLS } from "./index.js";
import { createMcpHandler, ProtocolError } from "@modelcontextprotocol/server";
import openapiSchema from "../openapi.json";
import { toolCallLimiter } from "./mcp/tool-limit.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Accept",
};

// One factory serves modern requests and legacy clients through the SDK's
// stateless fallback. No client identity or capabilities are stored globally.
const mcp = createMcpHandler(createMcpServer);

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
          specVersion: "2026-07-28",
          server: "kenya-law-mcp",
          version: "0.1.0",
          runtime: "Cloudflare Workers",
          tools: TOOLS.map((t) => t.name),
          openapi: "/openapi.json",
        }),
        {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Bound streamed bytes before the SDK or REST JSON parser allocates a body.
    const bodyChunks: ArrayBuffer[] = [];
    let bodyLength = 0;
    if (request.method === "POST" && request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bodyLength += value.byteLength;
          if (bodyLength > 128 * 1024) {
            await reader.cancel();
            return new Response("Request exceeds the 128 KiB limit", { status: 413, headers: CORS_HEADERS });
          }
          bodyChunks.push(new Uint8Array(value).buffer);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const boundedRequest = request.method === "POST"
      ? new Request(request, { body: new Blob(bodyChunks) }) : request;
    // REST endpoints for OpenAPI / ChatGPT Custom GPT Actions (/api/v1/:toolName)
    if (request.method === "POST" && url.pathname.startsWith("/api/v1/")) {
      const toolName = url.pathname.replace("/api/v1/", "").trim();
      try {
        const body = await boundedRequest.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("Expected a JSON object", { status: 400, headers: CORS_HEADERS });

        const responseJson = await toolCallLimiter.run(async () => {
          const response = await handleStatelessMcpRequest(
            {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: toolName, arguments: body },
            }
          );
          if (response.error) throw new ProtocolError(response.error.code, response.error.message);
          return response.result;
        });

        // Return tool output content directly for REST/OpenAPI client
        return new Response(JSON.stringify(responseJson), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || "Request execution failed." }),
          {
            status: err instanceof SyntaxError || err instanceof ProtocolError ? 400 : 500,
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
    const response = await mcp.fetch(boundedRequest);
    return new Response(response.body, { status: response.status,
      headers: { ...Object.fromEntries(response.headers), ...CORS_HEADERS } });
  },
};
