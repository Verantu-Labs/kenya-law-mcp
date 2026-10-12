# Connecting Kenya Law MCP

Install this repository as described in [README.md](README.md). No API key is required by the server.

## Local stdio

Configure the client's MCP server command as `bun`, with arguments `run` and the absolute path to `src/index.ts`.

Alternatively, install Node 22+, build with `bun run build` and configure `node` with the absolute path to `dist/src/index.js`. Keep dependencies installed beside compiled files. Local stdio sends retrieval requests directly from the machine running the server.

### Claude Desktop

Use Claude Desktop's local MCP configuration (`claude_desktop_config.json`), as described in the [official MCP guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers). Add the `mcpServers` entry from the README alongside existing entries and restart Claude Desktop. Use an absolute executable path if `bun` or `node` is not visible to desktop applications through PATH. The compiled Node configuration on Windows can look like:

```json
{
  "mcpServers": {
    "kenya-law": {
      "command": "node",
      "args": ["D:/projects/kenya-law-mcp/dist/src/index.js"]
    }
  }
}
```

Replace the example path with your checkout. Local stdio handshakes, tool discovery and calls are tested; the Claude Desktop UI itself is not covered by this repository's tests. Local servers and remote connectors are [separate connection mechanisms](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Other client configurations

These examples follow official configuration requirements. Their application UIs have not been tested here; do not treat documented configuration as a completed integration test.

### Claude Code

Follow the [official stdio instructions](https://code.claude.com/docs/en/mcp):

```sh
claude mcp add --transport stdio kenya-law -- bun run /absolute/path/kenya-law-mcp/src/index.ts
```

### Cursor

Put this in `.cursor/mcp.json` for a project, or `~/.cursor/mcp.json` globally, following [Cursor's MCP documentation](https://cursor.com/docs/mcp):

```json
{
  "mcpServers": {
    "kenya-law": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/absolute/path/kenya-law-mcp/src/index.ts"]
    }
  }
}
```

### Codex CLI

Use the [official MCP configuration](https://developers.openai.com/codex/mcp) in `~/.codex/config.toml`:

```toml
[mcp_servers.kenya-law]
command = "bun"
args = ["run", "/absolute/path/kenya-law-mcp/src/index.ts"]
```

Use the real absolute path and, if necessary, the absolute executable path. Keep existing server entries. Client approval policies and tool timeouts remain client settings; source fallbacks can take longer than one HTTP timeout.

## Remote HTTP transport

Use the [Worker MCP URL](https://kenya-law-mcp.robinskarani1.workers.dev/mcp) in clients supporting HTTP MCP. For REST/OpenAPI integrations, use [/openapi.json](https://kenya-law-mcp.robinskarani1.workers.dev/openapi.json).

Local builds and tests do not deploy this branch. A remote server can still expose older tool definitions.

REST example:

```sh
curl https://kenya-law-mcp.robinskarani1.workers.dev/api/v1/search_case_law \
  -H 'Content-Type: application/json' \
  -d '{"court":"KESC","year":2022,"limit":3}'
```

The reply is an MCP tool envelope. Check `isError`, then parse `content[0].text` where appropriate. HTTP 200 does not confirm upstream access or citation verification.

## Research sequence

1. Search with explicit court/year/station filters, or call `search_legislation` with an Act title.
2. Retrieve returned AKN identifiers with `get_akn_document`; inspect any requested section/article.
3. Use `verify_citation` for record matching. `check_citator` reports `not_checked` for judicial treatment; it does not establish whether a decision remains good law.

Directory listings and metadata do not establish a holding. Consult official text and the [documented limitations](README.md#errors-and-inherited-limitations).

Queries and URLs go to Kenya Law and, when using a remote server, through its host. This server does not need local legal workspaces or client documents. Avoid confidential facts in search queries.

## Before merging or releasing

Run `bun test`, `bun run typecheck`, `bun run build`, and `bun run test:live`. Deterministic CI must pass; live access is a separate requirement and a 403 is a failed live check. In the intended client, confirm tool discovery, court search, document retrieval and Constitution Article 50. Do not treat an Inspector connection alone as full client validation.

## Command-line client checks

After `bun run build`, these commands exercise the compiled server through the official MCP Inspector client:

```sh
npx --yes @modelcontextprotocol/inspector --cli node dist/src/index.js --method tools/list --strict
npx --yes @modelcontextprotocol/inspector --cli node dist/src/index.js --method tools/call --tool-name verify_citation --tool-arg 'citation_string=[2022] KESC 8'
```

To test the Worker locally, run `bunx wrangler dev --ip 127.0.0.1 --port 8799 --local`, then use a second terminal:

```sh
npx --yes @modelcontextprotocol/inspector --cli http://127.0.0.1:8799/mcp --method resources/list
```

The automated suite also sends modern 2026-07-28 metadata directly through the production HTTP handler and stdio subprocess, including discovery, required headers, version errors and clean shutdown. Inspector CLI checks cover protocol interoperability, not the Claude Desktop UI or a deployed Worker. A blocked live request is a failed access check, even when connection and discovery succeed.

## Remaining verification

Local protocol tests and configuration-document checks do not certify Claude Desktop, Claude Code, Cursor or Codex UI behavior. Confirm discovery, an actual readable authority and an explicit failure in the intended application. Check live access from the user/deployment network; source blocks must be reported honestly. Local builds and changes to this checkout are not remote releases.
