# AGENTS.md

> Universal AI Agent instructions for `@verantu-labs/kenya-law-mcp`. 

## Overview

`@verantu-labs/kenya-law-mcp` is an independent, open-source MCP server for official Kenya Law retrieval. Search results are discovery records; retrieval and metadata matching do not establish current legal validity or judicial treatment. See [architecture](docs/architecture.md) and [development](docs/development.md).

## Architecture & Layout

```text
src/
├── akn/         # Akoma Ntoso (AKN) XML & HTML parser and Markdown generator
├── client/      # Stateless HTTP client for Kenya Law endpoints and Atom feeds
├── tools/       # MCP tool handler functions (get_akn_document, verify_citation, etc.)
├── test/        # Unit & integration test suite (bun test)
├── index.ts     # CLI & Stdio MCP server entrypoint
└── worker.ts    # Cloudflare Workers Edge HTTP server entrypoint
```

## Core Principles

- **Verifiable Correctness**: Test code paths and network responses empirically before making architectural assertions.
- **Minimal Safe Changes**: Make the smallest targeted change that solves the issue. Avoid speculative refactoring.
- **Self-Documenting Code**: Prefer typed options objects over positional or ambiguous parameters.

## Code Style & Conventions

- **Inline Single-Use Helpers**: Do not extract single-use helper functions or temporary variables preemptively.
  ```ts
  // Good
  const data = await Bun.file(path.join(dir, "config.json")).json();

  // Bad
  const configPath = path.join(dir, "config.json");
  const data = await Bun.file(configPath).json();
  ```

- **Early Returns & `const`**: Avoid unnecessary `else` blocks and `let` reassignments.
  ```ts
  // Good
  if (!query) return [];
  const cacheKey = query.toLowerCase();
  ```

- **Clean Imports**: Avoid import aliasing (`import { foo as bar }`) and wildcard imports (`import * as Foo`). Use explicit `.js` extensions for ESM imports.

- **Bun Native APIs**: Use native `fetch()`, `Bun.file()`, and `AbortSignal.timeout()` where applicable.

## Domain & Network Rules

- **Absolute URL Normalization**: Always convert relative AKN URIs (`/akn/ke/judgment/...`) to absolute URLs (`https://new.kenyalaw.org/...`) before invoking `fetch()`.
- **HTTP Redirect Following**: Document retrieval must validate each redirect target against the official HTTPS host/path allowlist before following it. Use the bounded document fetcher so canonical expression-date redirects (`/eng@...`) work without enabling off-host requests.
- **Browser Headers**: Include realistic browser request headers (`User-Agent`, `Accept`, `Sec-Fetch-*`) to prevent WAF / 403 blocks.
- **Stateless MCP Execution**: Tool handlers must remain strictly stateless to support serverless deployment targets.

## Guardrails

- **Always**: Run `bun run verify:worker` before committing or proposing a push/PR; review the full and staged diff, scan for secrets/private material and report any unavailable checks. See [development checks](docs/development.md). Pushes and PR publication require explicit approval; never change protection rules or disable security-critical workflows without approval.
- **Ask First**: Ask before modifying public MCP tool names or JSON schema parameters.
- **Never**: Commit credentials, hardcode unnormalized relative fetch URLs, or swallow network exceptions silently.

## Development Commands

```bash
# Run in development mode (watch)
bun run dev

# Execute test suite
bun test

# Build production distribution
bun run build
```
