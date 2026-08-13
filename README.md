# Kenya Law MCP (`@verantu-labs/kenya-law-mcp`)

Model Context Protocol (MCP) server for Kenya legal documents (statutes, judgments, cause lists, and gazettes).

## Installation

### Remote
```bash
claude mcp add --transport http kenya-law https://kenya-law-mcp.robinskarani1.workers.dev/
```
Alternative guide for Claude Code: [Gist Guide](https://gist.github.com/RobinsKarani/d6beadb6fc378f6ad3dae19e0e2aa3c5)

### Local Stdio (Recommended)

Running locally via stdio executes requests directly on your local machine.

1. Clone repository:
```bash
git clone https://github.com/Verantu-Labs/kenya-law-mcp.git
cd kenya-law-mcp
```

2. Install dependencies:
```bash
bun install
```

3. Add to Claude:
```bash
claude mcp add kenya-law -- bun run /path/to/kenya-law-mcp/src/index.ts
```

## Tools

- `search_case_law`: Search court judgments by keyword, court, or year.
- `search_legislation`: Search Acts of Parliament and statutory provisions.
- `get_akn_document`: Fetch document text by Akoma Ntoso URN or URL.
- `verify_citation`: Validate citations and resolve canonical references.
- `check_citator`: Retrieve precedent history and treatment for judgments.
- `get_cause_list`: Fetch daily court schedules by station.
- `search_gazettes`: Search official Kenya Gazette notices.

## Development

```bash
bun install
bun test
bun run build
```

## License

MIT
