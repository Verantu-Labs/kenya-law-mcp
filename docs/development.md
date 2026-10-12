# Development and contribution

## Setup and checks

Clone the public repository and install [Bun](https://bun.sh) 1.4.0 (the pinned CI version) and Node 22+. From the checkout:

```sh
bun install --frozen-lockfile
bun run verify:worker
```

`build` cleans `dist` before compiling; do not keep hand-written files there. The compiled entrypoint is `dist/src/index.js`, with dependencies installed beside it. Node 22+ is required by the PDF dependency. `bun run dev` starts a stdio server in watch mode and waits for client input.

`verify` reuses the existing dependency audit, strict typecheck, deterministic tests (including MCP protocol checks) and production build, then checks diff whitespace. It stops at the first failure. `verify:worker` also bundles the Worker with locked Wrangler using `--dry-run`; it never deploys. CI and the manual workflow run the same `verify` command after a frozen install. The hosted runner is Ubuntu; a Windows pass is not Linux runtime acceptance.

`bun test` uses synthetic HTTP fixtures and actual parsers/handlers, including compressed PDFs, citation checks, error paths, cache eviction, argument validation, modern and legacy Worker transport, concurrent requests, redirect/body limits, byte-based cache eviction and stdio subprocesses with clean EOF shutdown. It must not contact the live portal or embed private documents. Run focused tests when iterating:

```sh
bun test src/test/pdf.test.ts
bun run test:live
bunx --no-install wrangler deploy --dry-run
```

The live script checks court discovery, judgment text, existence verification, Constitution Article 50 and legislation. It stops at the first failure; later checks are not verified in that run. A 403 is a failed access check. Worker dry-run bundles without deploying and does not establish live PDF extraction on Cloudflare.

Source-text security tests use `marked` as a development-only Markdown renderer and inspect its HTML result. They check that literal source text remains visible without active HTML, injected links/images or repeated entity decoding. The same suite exercises real AKN, HTML, DOCX and PDF extraction, cause-list resources, section headers, malformed markup and deep HTML traversal. These checks do not certify every client renderer or replace CodeQL analysis.

No linter or formatter is configured. `git diff --check` checks whitespace, not lint or full formatting; report that gap rather than labelling typecheck as lint. Review the complete diff. See [client and Inspector checks](../guide.md). Diagnostic logging belongs on stderr because stdout carries stdio JSON-RPC; avoid query/document logs. Distinguish unreadable sources, missing matches and upstream failures.

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

Before a commit, push or PR, run local verification and inspect both the complete and staged diff. With [Gitleaks](https://github.com/gitleaks/gitleaks) installed, scan history and the staged candidate:

```sh
git diff --check
git diff --cached --check
gitleaks git --redact --no-banner --log-opts=--all .
gitleaks git --pre-commit --staged --redact --no-banner .
```

Dependency auditing and secret scanning serve different purposes; `verify` does not replace Gitleaks or manual review for private material. Keep live portal/client checks separate and report blocked or unavailable checks. Push a coherent, locally verified batch only with explicit approval; a push to an open PR targeting main triggers CI and may also trigger Cloudflare previews.

## Keeping CI small

CI retains its required job name, `Test & Build MCP Server`. It runs on main pushes and PRs targeting main, with optional manual dispatch, a ten-minute timeout and cancellation of superseded runs for the same PR/ref. The deployment workflow is an explicit backup action, not the normal Cloudflare deployment path. It is not automatically run.

Standard GitHub-hosted runners in public repositories are [free](https://docs.github.com/en/billing/concepts/product-billing/github-actions); private-repository quotas and paid larger runners are different. Do not attribute a failed check to minutes without reading its job steps/logs. An upstream 403 in a live test is a test failure, not a runner startup failure. Live requests belong in `test:live`, not deterministic CI.

When using [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), verify the actual dashboard build/deploy commands. A successful bundle/deployment is not evidence that tests ran. If tests must gate Cloudflare deployment independently, set the build command to `bun run verify` after a frozen install, with the same Bun version. Keep Worker bundling in the deploy/preview command; do not add another GitHub deployment job for the same push. These dashboard settings are not controlled by `wrangler.toml` custom-build settings.

Review required checks before removing triggers or adding workflow path filters: a skipped workflow can leave a required check missing and block merging. Changing protection rules or disabling a security-critical workflow requires an explained maintainer decision and approval. This repository does not need a self-hosted runner or another CI service merely to reduce redundant runs.

## Remaining verification

Examples are checked against official configuration documentation, not every application UI. Synthetic checks do not prove exhaustive search, scheduling accuracy, legal validity or hosting abuse resistance. Hosting capacity controls and intended-client live acceptance remain deployment work. Modern HTTP tests check per-request metadata, required headers, discovery and version rejection; the SDK transport entries own protocol-era selection.
