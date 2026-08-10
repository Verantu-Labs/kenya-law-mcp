# KenyaLaw MCP — Architecture & Design Specification

**Author**: Verantu Labs / Solon Architecture Team  
**Date**: August 2026  
**Status**: Approved Architecture Blueprint  
**Target Repository**: `@verantu-labs/kenya-law-mcp`  

---

## Executive Overview

`kenya-law-mcp` is designed as **authoritative, stateless legal infrastructure for Kenyan law**. Rather than acting as a superficial wrapper around website scraping or returning unformatted PDFs, this server exposes a structured, queryable legal knowledge graph—comprising statutes, provisions, judicial decisions, courts, and gazette notices—to AI models (Claude Desktop, Cursor, Solon) and developers building legal applications.

---

## 1. MCP Protocol Findings (2026-07-28 Specification)

The protocol design adheres strictly to the **2026-07-28 Model Context Protocol (MCP) Specification**:

* **Stateless HTTP Architecture**: The 2026-07-28 spec deprecates legacy session-bound SSE transports in favor of **Streamable HTTP**. Servers do not maintain protocol-level session state across HTTP calls.
* **Separation of Protocol vs Application State**: Protocol handlers process each incoming JSON-RPC 2.0 request independently.
* **Error Semantics (`isError`)**: Tool execution failures (e.g. invalid citation format, non-existent statute provision) return standard JSON-RPC response payloads with `isError: true` rather than throwing raw JSON-RPC protocol exceptions. This provides actionable feedback to LLM clients.
* **Primitive Annotations**: Tools, Resources, and Prompts expose explicit descriptions, parameters, and input/output JSON Schemas to maximize model tool-selection accuracy.

---

## 2. TypeScript SDK Findings (`@modelcontextprotocol/sdk`)

* **Core Server**: Built using `@modelcontextprotocol/server` (`Server` class) with explicit capabilities declarations (`tools`, `resources`, `prompts`).
* **Dual Transport Support**:
  1. `StdioServerTransport`: For local process spawning by desktop clients (Claude Desktop, Cursor, Windsurf, Solon Desktop).
  2. `Streamable HTTP / Hono Transport`: For stateless serverless deployment (Cloudflare Workers, Hono, Express, Docker).
* **Zod Validation**: Input arguments are strictly validated using `zod` schemas to guarantee type safety and prevent malformed requests.

---

## 3. Stateless Architecture Decision

```
Client (Claude Desktop / Solon / Custom App)
                ↓
    Load Balancer / Gateway
                ↓
┌───────────────┬───────────────┬───────────────┐
│ MCP Node #1   │ MCP Node #2   │ MCP Node #3   │
└───────────────┴───────────────┴───────────────┘
                ↓
    Shared Legal Knowledge Core (SQLite / Local Memory Cache)
```

* **Zero Protocol Sessions**: No in-memory conversation memory, user sessions, or sticky routing required.
* **Horizontal Scalability**: Any server instance can serve any incoming request statelessly.
* **Immutability**: Legal data is treated as a persistent, versioned knowledge base.

---

## 4. Legal MCP Comparison

| Feature | Generic Scraper MCP | UK Law MCP (Ansvar) | CourtListener (Free Law Project) | **KenyaLaw MCP** |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Unit** | Raw HTML/PDF text | Statute provisions | Docket/Opinion graph | **Canonical Legal Entities (`ke:...`)** |
| **Search Engine** | Live Web Scraping | SQLite FTS5 / BM25 | PostgreSQL / Elasticsearch | **SQLite FTS5 + Citation Matcher** |
| **Citator Behavior** | None or Hallucinated | Fail-closed validator | Citation network | **Fail-closed Citator & Graph** |
| **Provenance** | None | Source URLs | Metadata & Pacer IDs | **Full Provenance & Content Hashes** |
| **Transport** | Stdio only | Stdio / Gateway | REST API | **Stdio + Streamable HTTP Stateless** |

---

## 5. Lessons from CourtListener (Free Law Project)

CourtListener demonstrates that legal information is a **connected graph**, not isolated documents:
* **Entity Hierarchy**: Jurisdiction → Court → Case / Docket → Opinion / Judgment → Citation.
* **Citation Tracking**: Cases cite other cases; tracking these links enables citator validation ("good law" vs "overruled").
* **Stable Entity IDs**: Primary keys must be persistent, human-readable URNs rather than volatile website URLs.

---

## 6. Lessons from UK Law MCP (Ansvar Systems)

* **Provision-Level Granularity**: Lawyers query specific sections (e.g. *Employment Act, s 43*), not entire 200-page statute PDFs.
* **Deterministic Search**: Use SQLite FTS5 with BM25 ranking for exact statutory and case law retrieval instead of relying solely on vector embeddings.
* **Deterministic Citation Validation**: Ground LLM outputs by verifying whether a cited provision or case actually exists in the legal corpus.

---

## 7. Recommended MCP Tool Surface (7 Core Tools)

1. **`kenyalaw_search`**: Primary discovery tool across statutes, provisions, judgments, and gazette notices. Supports queries, court filters, year ranges, and pagination.
2. **`kenyalaw_get`**: Retrieves canonical legal objects (`ke:statute:...`, `ke:case:...`) with exact source text, metadata, and provenance.
3. **`kenyalaw_citation`**: Validates, normalizes, and resolves legal citation strings to canonical IDs.
4. **`kenyalaw_relationships`**: Navigates the legal citation graph (`cites`, `citedBy`, `interprets`, `amends`).
5. **`kenyalaw_timeline`**: Retrieves legislative history and point-in-time statutory versions.
6. **`kenyalaw_sources`**: Returns provenance metadata, content checksums, and official publication details for a legal authority.
7. **`kenyalaw_about`**: Exposes dataset statistics, server version, and legal coverage scope.

---

## 8. Recommended Resource Surface (Akoma Ntoso URIs)

Exposes legal entities as MCP Resources using `kenyalaw://` resource templates:
* **`kenyalaw://statute/{slug}`**: Complete statute document.
* **`kenyalaw://statute/{slug}/s{section}`**: Specific statutory provision.
* **`kenyalaw://case/{id}`**: Complete judicial decision.
* **`kenyalaw://causelist/{station}`**: Daily court hearing schedule.

---

## 9. Canonical Data Model

### Entity URN Syntax
* **Constitution**: `ke:constitution:article-41`
* **Statute**: `ke:statute:employment-act-2007`
* **Statutory Section**: `ke:statute:employment-act-2007:s43`
* **Case Judgment**: `ke:case:kesc:2024:1`
* **Gazette Notice**: `ke:gazette:2026:gn-1042`

---

## 10. Search Architecture

```
User Query ("unfair termination section 43")
                     ↓
        Legal Entity Normalizer
                     ↓
   ┌─────────────────┴─────────────────┐
   ↓                                   ↓
Exact Citation Match             SQLite FTS5 + BM25 Search
   ↓                                   ↓
Canonical ID Match (`ke:...`)    Ranked Excerpts & Provisions
   └─────────────────┬─────────────────┘
                     ↓
          Merged Search Results
```

---

## 11. Legal Provenance Model

Every legal object returned by `kenyalaw_get` includes strict provenance:
```json
{
  "id": "ke:statute:employment-act-2007:s43",
  "provenance": {
    "publisher": "National Council for Law Reporting (Kenya Law)",
    "canonicalUrl": "https://new.kenyalaw.org/akn/ke/act/2007/11/eng@2012-04-16#sec_43",
    "retrievedAt": "2026-08-10T00:00:00Z",
    "authorityLevel": "primary_statute",
    "contentHash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "derived": false
  }
}
```

---

## 12. Transport Architecture

* **Stdio Transport**: Executed locally via `npx @verantu-labs/kenya-law-mcp` or `bun run src/index.ts` for Claude Desktop / Cursor integration.
* **Streamable HTTP Transport**: Exported via Hono handler in `src/server/http.ts` for cloud deployments on Cloudflare Workers, Render, or Docker.

---

## 13. Security Model

* **Read-Only Data Surface**: No destructive operations, arbitrary URL fetching, or arbitrary shell execution.
* **Input Schema Validation**: Strict parameter validation using Zod schemas.
* **Origin & Host Header Validation**: Prevents DNS rebinding attacks on HTTP endpoints.

---

## 14. Testing Strategy

1. **Unit Tests**: Parsers, citation normalizers, entity URN resolvers (`src/test/unit/`).
2. **Integration Tests**: Legal database queries, FTS5 search, fallback handlers (`src/test/integration/`).
3. **MCP Contract Tests**: Protocol JSON-RPC specification compliance (`src/test/contract/`).
4. **Client E2E Tests**: Simulated MCP Client calls testing `tools/list`, `tools/call`, `resources/read`, and `prompts/get`.

---

## 15. Licensing & Data-Access Considerations

* Primary legal texts (Acts of Parliament, judgments of Kenyan courts, official Kenya Gazette notices) are public legal authorities under the Laws of Kenya.
* Source attribution to the **National Council for Law Reporting (Kenya Law)** is maintained across all provenance headers.

---

## 16. Roadmap: V1 vs Future Scope

* **V1 (Current Deliverable)**: Clean 7-tool MCP surface, 4 resource templates, canonical ID model, SQLite FTS5 search index, fail-closed citation verifier, stdio + Streamable HTTP transport, 100% test pass rate.
* **V2 (Future)**: Deep legislative amendment diffing, point-in-time statutory time-travel, and automated dataset sync background pipelines.
