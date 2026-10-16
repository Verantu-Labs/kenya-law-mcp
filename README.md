# Kenya Law MCP

An MCP server for retrieving judgments, legislation, cause lists and Gazette records from official Kenya Law sources. Supports local stdio and HTTP. No API key or model provider is required.

## Setup

Install [Bun](https://bun.sh) 1.4.0 and Node.js 22 or later, then build from source:

```sh
git clone https://github.com/Verantu-Labs/kenya-law-mcp.git
cd kenya-law-mcp
bun install --frozen-lockfile
bun run build
```

Add the server to your MCP client, replacing the path with your checkout:

```json
{
  "mcpServers": {
    "kenya-law": {
      "command": "node",
      "args": ["/absolute/path/kenya-law-mcp/dist/src/index.js"]
    }
  }
}
```

On Windows, use a path such as `D:/projects/kenya-law-mcp/dist/src/index.js`. Keep dependencies installed. Install from source; this checkout is marked `private: true`.

For HTTP clients, the hosted MCP URL is `https://kenya-law-mcp.robinskarani1.workers.dev/mcp`. See the [connection guide](guide.md) for client-specific configuration, Bun, REST examples and troubleshooting. Local builds do not update the hosted server.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_case_law` | Find judgments by keywords, citation, court, station, year or month. |
| `search_legislation` | Find legislation by Act name. |
| `get_akn_document` | Retrieve document text, optionally selecting a section or article. |
| `get_documents_bulk` | Retrieve up to ten documents. |
| `verify_citation` | Match a citation against a retrieved official record. |
| `check_citator` | Check retrieval only, not subsequent judicial treatment. |
| `get_cause_list` | Retrieve station entries without date filtering. |
| `search_gazettes` | Search the legacy Gazette interface. |

Input schemas are available through MCP `tools/list` and [OpenAPI](openapi.json). See [request examples and result handling](guide.md#tool-inputs-and-results).

Search is not exhaustive. Retrieved text and citation matches do not establish current legal validity. Scanned PDFs require OCR, which is not included. Avoid confidential facts in queries. See [retrieval and security limits](docs/architecture.md).

## Development

```sh
bun run verify:worker  # audit, types, tests, build and Worker dry-run
bun run test:live      # separate live Kenya Law checks
```

[Development guidance](docs/development.md) covers commands, tests and contributions. [Architecture](docs/architecture.md) explains retrieval, parsing, storage and HTTP hosting. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Retrieved Kenya Law materials retain their own licensing terms.
