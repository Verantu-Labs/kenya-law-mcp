# Development and contribution

## Setup and checks

Clone the public repository and install [Bun](https://bun.sh). From the checkout:

```sh
bun install --frozen-lockfile
bun audit
bun run typecheck
bun test
bun run build
```

`build` cleans `dist` before compiling; do not keep hand-written files there. The compiled entrypoint is `dist/src/index.js`, with dependencies installed beside it. Node 22+ is required by the PDF dependency. `bun run dev` starts a stdio server in watch mode and waits for client input.

`bun test` uses synthetic HTTP fixtures and actual parsers/handlers, including compressed PDFs, citation checks, error paths, cache eviction, argument validation, modern and legacy Worker transport, concurrent requests, redirect/body limits, byte-based cache eviction and stdio subprocesses with clean EOF shutdown. It must not contact the live portal or embed private documents. Run focused tests when iterating:

```sh
bun test src/test/pdf.test.ts
bun run test:live
bunx --no-install wrangler deploy --dry-run
```

The live script checks court discovery, judgment text, existence verification, Constitution Article 50 and legislation. It stops at the first failure; later checks are not verified in that run. A 403 is a failed access check. Worker dry-run bundles without deploying and does not establish live PDF extraction on Cloudflare.

No lint script is configured. Use `git diff --check` and review the diff. See [client and Inspector checks](../guide.md). Diagnostic logging belongs on stderr because stdout carries stdio JSON-RPC; avoid query/document logs. Distinguish unreadable sources, missing matches and upstream failures.

## Modifying tools

Trace [`TOOLS` and dispatch](../src/index.ts), `src/tools`, the client method, resources and tests before editing. Preserve public names and schemas unless a reviewed API change is needed. Keep error envelopes and existing aliases. Discoveries are not readable authorities; retrieval failure is not a successful empty search or proof of legal absence, validity or good-law status.

Add focused success/failure regressions and regenerate the REST schema when `TOOLS` changes:

```sh
bun run openapi
git diff --check
```

Generic retrieval belongs here; application-specific orchestration, accounts, private fixtures and internal services do not. Endpoint lists in generated schemas are configuration metadata rather than host health checks. Legacy Smithery/desktop manifests do not prove marketplace publication or one-click installation. The package is `private: true`; do not assume `npx @verantu-labs/kenya-law-mcp` installs a registry release.

## Review and release

Use a small cohesive branch. Describe the problem, resulting behavior, actual checks and remaining limitations. Review staged files and commit history for secrets, private paths, proprietary dependencies and internal endpoints before publication. Keep local state, logs, bundles and dependency folders out of Git.

CI and the manual workflow install locked dependencies, audit advisories and test/typecheck before building. No registry publication step is configured while the package is `private: true`; a registry release requires a deliberate maintainer decision. A build does not update a Worker. Check live access from the target network and test tool discovery, representative success/failure and source inspection in the intended client before advertising an integration.

## Remaining verification

Examples are checked against official configuration documentation, not every application UI. Synthetic checks do not prove exhaustive search, scheduling accuracy, legal validity or hosting abuse resistance. Hosting capacity controls and intended-client live acceptance remain deployment work. Modern HTTP tests check per-request metadata, required headers, discovery and version rejection; the SDK transport entries own protocol-era selection.
