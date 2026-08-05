# Kenya Law MCP Server (`@verantu-labs/kenya-law-mcp`)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)
[![Model Context Protocol](https://img.shields.io/badge/MCP-2026.07.28-green.svg)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

An official, enterprise-grade Model Context Protocol (MCP) server providing deterministic, anti-hallucination access to **Kenyan Statutory Law and Case Law**. Built using the official `@modelcontextprotocol/sdk` TypeScript framework.

Unlike basic scraping wrappers that suffer from web rate limits, broken DOM scrapers, and hallucinated citations, `kenya-law-mcp` operates on a **hybrid zero-latency architecture**: an embedded SQLite database indexed with `FTS5` BM25 full-text ranking paired with an automated fallback to the newly upgraded **Kenya Law Portal** (`new.kenyalaw.org`).

---

## 🌟 Key Features

* 🏛️ **Full Medium Neutral Citation (MNC) Support**: Aligned with Kenya Law's 2024+ transition from legacy `eKLR` citations to international Medium Neutral Citations (MNC).
* 🛡️ **Anti-Hallucination Citation Verifier (`verify_citation`)**: Deterministically checks whether a case citation or statutory reference exists before an AI model presents it in a legal brief.
* 🕸️ **Precedent Knowledge Graph**: Explore citation networks (`find_cases_citing`, `find_cases_cited_by`) and track whether a precedent has been **applied**, **distinguished**, or **explicitly overruled**.
* 📜 **Statute & Section Retrieval**: Instant lookup of major Kenyan Acts (Constitution, Employment Act, Civil Procedure Act, Evidence Act) with verbatim section text and OSCOLA formatting.
* ⚡ **Full MCP 2026 Specification Compliance**: Includes Tools, Read-Only Resources (`kenyalaw://case/...`), Legal Prompts (`verify_brief_citations`), and Real-time Autocompletion (`CompleteRequestSchema`).
* 📦 **Zero External Solon Dependencies**: Hermetically sealed and ready for standalone open-source deployment across Claude Desktop, Cursor, VS Code, and Solon IDE.

---

## 🚀 Quickstart

### Running with Bun / Node
```bash
# Clone and install dependencies
git clone https://github.com/Verantu-Labs/solon.git
cd solon/packages/kenya-law-mcp
bun install

# Build & Run Stdio Transport
bun run start
```

---

## ⚙️ Configuration for AI Clients

### 1. Claude Desktop Setup
Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kenya-law": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/solon/packages/kenya-law-mcp/src/index.ts"
      ]
    }
  }
}
```

### 2. Cursor / VS Code Setup
In Cursor settings under **MCP Servers**:
* **Name**: `kenya-law`
* **Type**: `stdio`
* **Command**: `bun run /path/to/solon/packages/kenya-law-mcp/src/index.ts`

### 3. Testing with MCP Inspector
Inspect and test all tools, resources, and prompts interactively:
```bash
bun run inspector
```

---

## 🛠️ MCP Tools Overview

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `list_statutes` | List major Kenyan statutes with pagination and category filters. | `category`, `limit`, `offset` |
| `search_statutes` | BM25 full-text search across statutory sections. | `query`, `statute_filter`, `limit` |
| `get_statute_section` | Retrieve verbatim section text and OSCOLA citation. | `statute`, `section` |
| `search_cases` | Full-text BM25 case law search with year & court filters. | `query`, `court_level`, `year_from` |
| `get_case_details` | Detailed case summary, holding, parties, and full text. | `citation` |
| `verify_citation` | **Anti-Hallucination Engine**: Verifies if citation exists. | `citation` |
| `find_cases_citing` | Precedent Graph: List subsequent cases citing an authority. | `citation`, `case_id` |
| `find_cases_cited_by` | Precedent Graph: Map authorities cited by a judgment. | `citation`, `case_id` |
| `find_overruled_cases` | Precedent Graph: Identify cases explicitly overruled. | `citation`, `case_id` |

---

## 📚 Read-Only Resources & Prompts

### Resources (URI Templates)
* `kenyalaw://case/{citation}` — Access case judgment by neutral citation.
* `kenyalaw://statute/{abbreviation}/section/{section}` — Direct access to statutory sections.

### Legal Prompts
* `draft_oscola_citation` — Guided OSCOLA Kenya citation formatting.
* `verify_brief_citations` — Audits an entire legal brief to flag hallucinated references.

---

## 📄 License

Maintained by **Verantu Labs** under the **AGPL-3.0 License**. Open-source contribution welcome!
