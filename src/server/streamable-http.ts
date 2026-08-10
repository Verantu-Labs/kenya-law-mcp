/**
 * src/server/streamable-http.ts — Modern Stateless Streamable HTTP Endpoint Handler (2026-07-28 Spec).
 * Enables horizontal scaling behind AWS ALBs, Cloudflare Workers, Hono, Express, or Docker containers.
 */

import { handleStatelessMcpRequest } from "../index.js";

export interface StreamableHttpRequest {
  method: string;
  headers: Record<string, string>;
  body?: any;
}

/**
 * Evaluates an incoming Streamable HTTP POST request statelessly without session affinity.
 */
export async function handleStreamableHttpRequest(req: StreamableHttpRequest) {
  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const responsePayload = await handleStatelessMcpRequest(payload, req.headers);

  return {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-MCP-Protocol-Version": "2026-07-28",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(responsePayload),
  };
}
