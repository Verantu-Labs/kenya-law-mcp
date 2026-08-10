# Kenya Law MCP (`@verantu-labs/kenya-law-mcp`)

Model Context Protocol (MCP) server for searching and reading Kenya statutes, court judgments, daily cause lists, and gazettes from `kenyalaw.org`.

Works with Claude Desktop, Cursor, Solon, and custom TypeScript apps.

## Tools Included

- `search_case_law` (alias: `kenyalaw_search`): Search judgments by keyword, court, and year.
- `get_akn_document` (alias: `kenyalaw_get`): Fetch full judgment or statute text by Akoma Ntoso URN/URL.
- `verify_citation` (alias: `kenyalaw_citation`): Check if a legal citation is valid and get its canonical reference.
- `check_citator` (alias: `kenyalaw_relationships`): Get precedent history and cited cases for a judgment.
- `get_cause_list`: Fetch daily court schedules for court stations.
- `search_gazettes` / `search_legislation`: Search official Kenya Gazettes and Acts of Parliament.

## Claude Desktop Setup

### Method 1: Local Stdio (Recommended)

Running locally via Bun or Node ensures search requests use your local network IP, avoiding Cloudflare WAF datacenter blocks on `kenyalaw.org`.

1. Clone repository:
```bash
git clone https://github.com/Verantu-Labs/kenya-law-mcp.git
cd kenya-law-mcp
```

2. Install dependencies:
```bash
bun install
```

3. Add via Claude CLI (1-line command):
```bash
claude mcp add kenya-law -- bun run /absolute/path/to/kenya-law-mcp/src/index.ts
```

Or add to your Claude Desktop JSON config file (`~/.config/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "kenya-law": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/kenya-law-mcp/src/index.ts"
      ]
    }
  }
}
```

---

### Method 2: Cloudflare Remote Worker

To connect directly to the hosted Cloudflare Worker via Claude CLI:

```bash
claude mcp add --transport http kenya-law https://kenya-law-mcp.robinskarani1.workers.dev/
```

Or add to your JSON config file manually:
```json
{
  "mcpServers": {
    "kenya-law-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://kenya-law-mcp.robinskarani1.workers.dev/"
      ]
    }
  }
}
```

#### Note on Network Behavior
Remote cloud worker instances operate from datacenter IP blocks (AS13335). If external legal portals restrict datacenter IP ranges for live queries, use Method 1 (Local Stdio) for complete query coverage.

---

### Method 3: One-Click Extension Bundle (`.mcpb`)

Validate and pack into a single-file desktop extension bundle:

```bash
npx @anthropic-ai/mcpb validate manifest.json
npx @anthropic-ai/mcpb pack . kenya-law-mcp.mcpb
```

---

## TypeScript SDK Usage

```typescript
import { KenyaLawClient } from "@verantu-labs/kenya-law-mcp";

// Search cases
const cases = await KenyaLawClient.searchCaseLaw("unfair termination", "High Court");

// Fetch document
const doc = await KenyaLawClient.getAknDocument("/akn/ke/judgment/kesc/2026/19/eng@2026-01-30");

// Verify citation
const citation = await KenyaLawClient.verifyCitation("[2026] KESC 19");
```

## Development and Testing

```bash
# Run test suite
bun test

# Build TypeScript output
bun run build

# Start local stdio inspector
bun run inspector
```

## License

MIT License. Developed by Verantu Labs. Source legal documents are public domain texts published by the National Council for Law Reporting (Kenya Law).
