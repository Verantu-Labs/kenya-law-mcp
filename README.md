# Kenya Law MCP Infrastructure (`@verantu-labs/kenya-law-mcp`)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)
[![Model Context Protocol](https://img.shields.io/badge/MCP-2026.07.28-green.svg)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

Production-grade, stateless Model Context Protocol (MCP) server and TypeScript SDK providing direct access to primary Kenyan legal texts (Constitution, Acts of Parliament, High Court / Court of Appeal / Supreme Court Judgments, Daily Cause Lists, and Kenya Gazettes) fetched directly from the National Council for Law Reporting (`kenyalaw.org`).

Built with the official `@modelcontextprotocol/sdk` TypeScript framework for Claude Desktop, Cursor, Solon Desktop, and custom legal tech applications.

---

## Architecture Highlights

```
Client (Claude Desktop / Cursor / Solon / Custom App)
                    ↓
        Load Balancer / Gateway
                    ↓
    ┌────────────────┬────────────────┐
    │ Stdio Server   │ Streamable HTTP│
    └────────────────┴────────────────┘
                    ↓
     Stateless Kenya Law Knowledge Core
        (Canonical URNs + Provenance)
                    ↓
         Authoritative Sources
```

* **Stateless Streamable HTTP and Stdio**: Fully stateless request execution per the 2026-07-28 MCP specification. Scalable across horizontal server instances behind standard load balancers.
* **Canonical Entity Modeling (`ke:...`)**: Represents legal authorities using persistent URNs (`ke:statute:employment-act-2007:s43`, `ke:case:kesc:2024:1`, `ke:constitution:article-41`).
* **Fail-Closed Citation Verification**: Returns `verified: false` and `isError: true` for fake or non-existent citations, eliminating AI hallucinations under ABA AI Ethics standards.
* **Full Provenance and Checksums**: Every legal object returns publisher attribution, canonical source URLs, retrieval timestamps, and SHA-256 (`fnv1a32`) content hashes.

---

## Canonical MCP Tools (7 Tools)

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `kenyalaw_search` | `query`, `court`, `year_from`, `limit` | Primary legal discovery tool across statutes, case law, and gazettes. |
| `kenyalaw_get` | `id` | Retrieves canonical legal object (`ke:statute:...`, `ke:case:...`) with exact source text and provenance. |
| `kenyalaw_citation` | `citation` | Fail-closed citation validator. Normalizes citations and resolves to canonical URNs. |
| `kenyalaw_relationships` | `id` | Traverses precedent treatment citation graph (`cites`, `citedBy`, `interprets`, `amends`). |
| `kenyalaw_timeline` | `id` | Retrieves legislative history, enactment dates, and point-in-time statutory metadata. |
| `kenyalaw_sources` | `id` | Inspects source provenance metadata, SHA-256 checksums, and official publication details. |
| `kenyalaw_about` | *None* | Returns server status, protocol version (2026-07-28), dataset stats, and coverage scope. |

*(Legacy tool names `get_akn_document`, `search_case_law`, `verify_citation`, `check_citator`, `get_cause_list`, `search_gazettes` are preserved as backward-compatible aliases).*

---

## MCP Resources and Resource Templates

Exposes read-only legal entities as MCP Resources for direct context attachment in Claude Desktop and Cursor:

| Resource URI Template | Name | Description |
| :--- | :--- | :--- |
| `kenyalaw://statute/{slug}` | Statute Document | Full Markdown text and OSCOLA references for an Act of Parliament. |
| `kenyalaw://case/{court}/{year}/{id}` | Judicial Decision | Full text High Court, Court of Appeal, or Supreme Court judgment. |
| `kenyalaw://causelist/{station}` | Daily Cause List | Hearing schedule for court stations (e.g. `kenyalaw://causelist/milimani`). |
| `kenyalaw://statutes/constitution-2010` | Constitution of Kenya | Static resource for the Supreme Law of Kenya (2010). |

---

## Prompts Included

1. `research_case_precedent`: Guided case law research, precedent analysis, and OSCOLA citation drafting.
2. `verify_legal_citation`: Verification and grounding workflow for legal citations.
3. `analyze_statute_section`: Statutory section breakdown of rights, obligations, and penalties.
4. `draft_legal_submission`: Formal legal submission drafting backed by verified Kenyan precedent.

---

## Client Integration Guide

### Method 1: Local Stdio Execution via `src/index.ts` (Recommended and Most Effective)

Running the server locally using Bun or Node stdio is the most effective integration method. Outbound HTTP requests originate directly from your local network IP address, avoiding datacenter IP blocking (HTTP 403) from target legal repositories and delivering 100% complete search results.

#### Step 1: Clone the Repository
```bash
git clone https://github.com/Verantu-Labs/kenya-law-mcp.git
cd kenya-law-mcp
```

#### Step 2: Install Dependencies
```bash
bun install
```

#### Step 3: Configure Claude Desktop
Open or create your Claude Desktop configuration file:
* Linux: `~/.config/Claude/claude_desktop_config.json`
* macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
* Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following JSON configuration pointing to your local `src/index.ts` path:
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

#### Step 4: Restart Claude Desktop
Relaunch Claude Desktop. The `kenya-law` connector will automatically initialize over stdio with full local search access.

---

### Method 2: Remote Cloudflare Worker Connection (Cloud Connector)

You can also connect Claude Desktop directly to the hosted Cloudflare Worker deployment without installing local dependencies.

#### Step 1: Open Claude Desktop Settings
In Claude Desktop, navigate to **Settings** -> **Developer** -> **Edit Config**.

#### Step 2: Add Remote Connector Configuration
Add the remote Cloudflare Worker endpoint using `mcp-remote`:
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

For desktop applications supporting the Model Context Protocol Bundle specification (`.mcpb`), double-click `kenya-law-mcp.mcpb` or install via CLI:

```bash
npx @anthropic-ai/mcpb validate manifest.json
npx @anthropic-ai/mcpb pack . kenya-law-mcp.mcpb
```

---

## Developer SDK Usage

Install `@verantu-labs/kenya-law-mcp` in any Node.js / Bun application:

```typescript
import { KenyaLawKnowledgeCore, KenyaLawClient, parseLegalUrn } from "@verantu-labs/kenya-law-mcp";

// 1. Search legal core
const searchResults = await KenyaLawKnowledgeCore.search("unfair termination", { limit: 5 });

// 2. Retrieve canonical legal object
const act = await KenyaLawKnowledgeCore.getLegalObject("ke:statute:employment-act-2007:s43");
console.log(act.markdown, act.provenance.contentHash);

// 3. Verify citation (fail-closed)
const verification = await KenyaLawKnowledgeCore.resolveCitation("[2022] KESC 8");
console.log(verification.valid, verification.status);
```

---

## License and Attribution

Maintained by Verantu Labs under the AGPL-3.0 License.  
Source legal texts are published under public domain authority by the National Council for Law Reporting (Kenya Law).
