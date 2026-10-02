/**
 * generate-openapi.ts — Generates openapi.json OpenAPI 3.0.3 spec for ChatGPT Custom GPT Actions.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { TOOLS } from "../src/index.js";

function buildOpenApiSpec() {
  const paths: Record<string, any> = {};

  for (const tool of TOOLS) {
    const routePath = `/api/v1/${tool.name}`;
    paths[routePath] = {
      post: {
        summary: tool.description,
        operationId: tool.name,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: tool.inputSchema,
            },
          },
        },
        responses: {
          "200": {
            description: "Successful response from Kenya Law AKN service",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
        },
      },
    };
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Kenya Law Akoma Ntoso (AKN) API",
      description: "API endpoint connecting AI clients to Kenya statutes, High Court and Appellate judgments, daily cause lists, and official Gazettes.",
      version: "0.2.0",
    },
    servers: [
      {
        url: "https://kenya-law-mcp.robinskarani1.workers.dev",
        description: "Cloudflare Workers Edge Server (Primary)",
      },
      {
        url: "https://kenya-law-mcp.verantulabs.workers.dev",
        description: "Cloudflare Workers Edge Server (Mirror)",
      },
    ],
    paths,
  };

  const outputPath = resolve(process.cwd(), "openapi.json");
  writeFileSync(outputPath, JSON.stringify(spec, null, 2), "utf-8");
  console.log(`Generated OpenAPI spec at: ${outputPath}`);
}

buildOpenApiSpec();
