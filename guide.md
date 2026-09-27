# Connecting Kenya Law MCP

Install this repository as described in [README.md](README.md). No API key is required by the server.

## Local stdio

Configure the client's MCP server command as `bun`, with arguments `run` and the absolute path to `src/index.ts`.

Alternatively, build with `bun run build` and configure `node` with the absolute path to `dist/src/index.js`. Keep dependencies installed beside compiled files. Local stdio sends retrieval requests directly from the machine running the server.

### Claude Desktop

Use Claude Desktop's local MCP configuration (`claude_desktop_config.json`), as described in the [official MCP guide](https://github.com/modelcontextprotocol/docs/blob/main/quickstart/user.mdx). Add the `mcpServers` entry from the README alongside existing entries and restart Claude Desktop. Use an absolute executable path if `bun` or `node` is not visible to desktop applications through PATH. The compiled Node configuration on Windows can look like:

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

## Existing remote adapter

Use the existing [Worker URL](https://kenya-law-mcp.robinskarani1.workers.dev/) in clients supporting HTTP MCP. For REST/OpenAPI integrations, use [/openapi.json](https://kenya-law-mcp.robinskarani1.workers.dev/openapi.json).

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
