/**
 * worker.ts — Cloudflare Workers / Edge Runtime entry point for kenya-law-mcp.
 * Implements the 2026-07-28 Stateless MCP Specification (Self-contained HTTP POST requests, zero session state).
 */

import { handleStatelessMcpRequest, TOOLS } from "./index.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Method, Mcp-Name, Mcp-Version",
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight options
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check endpoint
    if (url.pathname === "/health" || (url.pathname === "/" && request.method === "GET")) {
      return new Response(
        JSON.stringify({
          status: "online",
          specVersion: "2026-07-28 (Stateless MCP)",
          server: "kenya-law-mcp",
          version: "0.2.0",
          runtime: "Cloudflare Workers",
          tools: TOOLS.map((t) => t.name),
        }),
        {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // 2026-07-28 Stateless MCP POST Handler (Single endpoint / or /mcp)
    if (request.method === "POST") {
      try {
        const payload = await request.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        request.headers.forEach((val, key) => {
          headers[key.toLowerCase()] = val;
        });

        // Evaluate request statelessly (No session state, no handshake required)
        const responseJson = await handleStatelessMcpRequest(payload, headers);

        return new Response(JSON.stringify(responseJson), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-MCP-Protocol-Version": "2026-07-28",
            ...CORS_HEADERS,
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: `Internal server error: ${err?.message || err}` },
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
