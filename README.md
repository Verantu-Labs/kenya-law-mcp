# Kenya Law MCP Server (`@verantu-labs/kenya-law-mcp`)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)
[![Model Context Protocol](https://img.shields.io/badge/MCP-2026.07.28-green.svg)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

An official, enterprise-grade Model Context Protocol (MCP) server providing **dynamic, anti-hallucination real-time access** to **Kenyan Statutory Law, Case Law, Cause Lists, and Official Gazettes**. Built using the official `@modelcontextprotocol/sdk` TypeScript framework.

Unlike static database dumps, `kenya-law-mcp` acts as a **stateless, dynamic real-time context bridge**. Every tool call accepts runtime parameters (`query`, `act_name`, `court`, `akn_url`, `date`) and fetches live, structured Akoma Ntoso (AKN) XML and search results on demand from `new.kenyalaw.org`.

---

## 🌟 Key Capabilities

* 🏛️ **Dynamic Akoma Ntoso (AKN) Document Resolution**: Resolves statutes and judgments dynamically into clean, non-truncated Markdown with OSCOLA citations.
* 🛡️ **Citation Verification Engine (`verify_citation`)**: Grounds LLM output by deterministically verifying if a legal citation or statute exists before presenting it in a brief.
* 📦 **Bulk Document Access (`get_documents_bulk`)**: Fetches up to 10 legal documents in parallel in a single API round-trip to conserve context window tokens.
* 🕸️ **Precedent Knowledge Citator (`check_citator`)**: Maps precedent treatment (followed, distinguished, overruled) and citing case references from live XML metadata.
* 📜 **Statute & Gazette Search**: Real-time search across Acts of Parliament, Legal Notices, and official Kenya Gazette announcements (land titles, probate, tribunal decisions).
* 📅 **Daily Cause Lists**: Real-time lookup of court hearing schedules by station (Milimani, Mombasa, Eldoret) and hearing date.

---

## 🛠️ Dynamic MCP Tools Summary

| Tool Name | Key Parameters | Description |
| :--- | :--- | :--- |
| `search_case_law` | `query`, `court`, `year_from`, `limit` | Real-time search across High Court, Court of Appeal, and Supreme Court judgments. |
| `search_legislation` | `act_name`, `limit` | Real-time search across revised Acts of Parliament and Legal Notices. |
| `get_akn_document` | `akn_url` | Fetches raw Akoma Ntoso XML and converts it statelessly into structured Markdown. |
| `get_documents_bulk` | `akn_urls: string[]` | Fetches up to 10 AKN legal documents in parallel in a single API call. |
| `check_citator` | `case_akn_url` | Resolves precedent history and citing references from live XML metadata. |
| `verify_citation` | `citation_string` | Verifies whether a legal citation exists on Kenya Law to eliminate hallucinations. |
| `get_cause_list` | `court_station`, `date` | Retrieves daily court cause lists by court station and date. |
| `search_gazettes` | `query`, `limit` | Real-time search across official Kenya Gazette notices. |

---

## 🚀 Connecting to AI Clients

### 1. Claude Desktop (Remote HTTP Edge or Stdio)

**Remote Worker Transport (Recommended):**
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "kenya-law-remote": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://kenya-law-mcp.robinskarani1.workers.dev/"]
    }
  }
}
```

**Local Stdio Transport:**
```json
{
  "mcpServers": {
    "kenya-law-local": {
      "command": "bun",
      "args": ["run", "/path/to/kenya-law-mcp/src/index.ts"]
    }
  }
}
```

### 2. Claude Code CLI
```bash
claude mcp add --transport http kenya-law https://kenya-law-mcp.robinskarani1.workers.dev/
```

### 3. Cursor / Windsurf / VS Code
* **Server URL**: `https://kenya-law-mcp.robinskarani1.workers.dev/`
* **Transport**: `HTTP (Streamable JSON-RPC)` or `stdio` via `bun run src/index.ts`.

---

## 💬 Sample Prompts

Try prompts like:
* *"Search for recent Supreme Court judgments on land rights in Kenya"*
* *"Fetch the full text of the Employment Act 2007 section by section"*
* *"Verify every citation in this legal brief: [2022] KESC 8 and No. 11 of 2007"*
* *"Get today's cause list for Milimani Law Courts"*
* *"Check the citator status for /akn/ke/judgment/kesc/2023/30 and summarize its precedent status"*

---

## 📄 License

Maintained by **Verantu Labs** under the **AGPL-3.0 License**.
