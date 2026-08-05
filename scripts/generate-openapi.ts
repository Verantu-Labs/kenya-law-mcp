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
      description: "Deterministic API for Kenya statutes, case law, daily cause lists, and citators.",
      version: "0.2.0",
    },
    servers: [
      {
        url: "https://kenya-law-mcp.verantulabs.workers.dev",
        description: "Cloudflare Workers Edge Server",
      },
    ],
    paths,
  };

  const outputPath = resolve(process.cwd(), "openapi.json");
  writeFileSync(outputPath, JSON.stringify(spec, null, 2), "utf-8");
  console.log(`Generated OpenAPI spec at: ${outputPath}`);
}

buildOpenApiSpec();
