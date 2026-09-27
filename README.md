# Kenya Law MCP (`@verantu-labs/kenya-law-mcp`)

Independent MCP server for public Kenya Law judgments and legislation, with local stdio and the repository's existing Cloudflare Worker HTTP/REST adapter. No application backend, account, provider key, database, or external workspace is required.

## Local installation

Install [Bun](https://bun.sh), then:

```sh
git clone https://github.com/Verantu-Labs/kenya-law-mcp.git
cd kenya-law-mcp
bun install --frozen-lockfile
bun run build
```

For a client supporting stdio, configure:

```json
{
  "mcpServers": {
    "kenya-law": {
      "command": "bun",
      "args": ["run", "/absolute/path/kenya-law-mcp/src/index.ts"]
    }
  }
}
```

On Windows, use a path such as `D:/projects/kenya-law-mcp/src/index.ts`. Clients have different configuration formats; the command and arguments are the same. The compiled entrypoint is `node /absolute/path/kenya-law-mcp/dist/src/index.js` (Node 20+). This checkout has `private: true`; cloning is the supported installation route rather than assuming an npm release exists.

Claude Code example:

```sh
claude mcp add kenya-law -- bun run /absolute/path/kenya-law-mcp/src/index.ts
```

## Tools

| Tool | Advertised parameters | Returned content |
| --- | --- | --- |
| `search_case_law` | `query`; optional `court`, `court_code`, `court_station`, `year`, `year_from`, `month`, `limit`. Query can be omitted for court/year searches. | JSON text with `query`, `total_results`, filters and `results`. Direct AKN input returns one discovery record. |
| `get_akn_document` | `akn_url`; optional `section` or `article` | Document/directory Markdown; an error if a requested provision cannot be located. |
| `get_documents_bulk` | `akn_urls` | JSON text containing `requested_count` and `documents`; processes the first 10 URLs in parallel. |
| `search_legislation` | `act_name`; optional `limit` | JSON text with `act_name`, `count` and `results`. |
| `verify_citation` | `citation_string` | JSON text with `verified` and matching record information; accepts AKN identifiers or citation text. |
| `check_citator` | `case_akn_url` | Existence information; `status: "not_checked"` when found. Judicial treatment is not retrieved. |
| `get_cause_list` | `court_station`; optional `date` | Station/date and parsed table entries; see limitations below. |
| `search_gazettes` | `query`; optional `limit` | JSON text with `query`, `count` and legacy Gazette search results. |

Search limits default to 10 and are capped at 50. Handlers retain compatibility aliases; use advertised parameter names because clients may validate required fields.

Example `search_case_law` arguments:

```json
{"court":"KEHC","court_station":"Meru","year":2026,"month":8,"limit":5}
```

Example `get_akn_document` arguments:

```json
{"akn_url":"/akn/ke/act/2010/constitution/eng@2010-09-03","article":"50"}
```

Search results and directories are discovery records. Retrieve the document before relying on its content.

## Retrieval and architecture

Tools call `KenyaLawClient` directly. Court/year searches use official directories, discover station identifiers, and can inspect page 2. Other searches retain HTML and Atom-feed fallbacks. Document retrieval normalizes relative URLs, follows redirects, tries the alternate official host/source when applicable, and parses HTML/XML or supported DOCX bytes. HTML parsing removes site navigation; XML parsing includes nested AKN content. Section selection uses text-based extraction.

Requests use browser-style headers and per-request timeouts, generally 6–15 seconds. Multiple fallbacks can take longer. One-hour process-local maps cache documents/results. There is no durable storage, and these maps are not bounded LRU caches.

## HTTP and interoperability

The existing Worker accepts MCP JSON-RPC POSTs and exposes tools at `/api/v1/<tool_name>`. `/openapi.json` contains generated REST schemas. Replies retain MCP `content` envelopes; parse `content[0].text` for tools returning JSON. HTTP 200 alone does not establish tool success: inspect `isError`.

The existing endpoint is [kenya-law-mcp.robinskarani1.workers.dev](https://kenya-law-mcp.robinskarani1.workers.dev/). Building this checkout does not deploy it. See [guide.md](guide.md) for connection examples.

Stdio uses the MCP SDK; HTTP uses the repository's existing custom adapter. Comprehensive compatibility with every ChatGPT, Claude, Codex, Cursor, Gemini or custom client is not verified. Resources/prompts are exposed by the HTTP handler; stdio currently registers tools only. Existing public prompts were retained, but treatment-check wording does not mean treatment data is available.

## Errors and inherited limitations

- Recognized HTTP 403 failures produce blocked errors in case/legislation searches and citation tools. Single-document tool failures set `isError: true`. Some non-403/feed failures still become empty results; empty results do not prove an authority is absent.
- Feed fallback can return unrelated recent items. Directory keyword matching/pagination are limited. `year_from` becomes a specific year on the directory path, not a complete lower-bound date search.
- Directory rendering handles court and optional year; use `search_case_law` for station/month filtering. A directory is not judgment text.
- HTML/XML parsing, DOCX ZIP extraction and section boundaries are heuristic. PDF extraction/OCR are not implemented. Unexpected HTML, malformed/binary content or short documents may be misclassified. Inspect the returned text before citing it.
- Bulk retrieval retains lookup-error Markdown and does not reliably flag partial failures at the top level.
- Existence does not establish current validity, completeness, a holding or judicial treatment. `not_checked` replaces the previous unsupported `good_law` status.
- Cause-list date filtering is not implemented upstream; entries can contain default hearing/time values. Gazette retrieval uses a legacy interface. These are not verified scheduling or exhaustive notice services.
- Input coercion and URL handling remain permissive, including absolute document URLs and redirects. The Worker has no application authentication/rate limiting. This sync is not a public-service security-hardening release.
- Existing resource identifier mappings remain unchanged and have limitations; prefer direct AKN tool calls.

This update synchronizes the established retrieval implementation. It does not add a different search API, document-processing dependencies, transport architecture or broader behavioral repairs.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun run openapi
```

The inherited suite includes live requests and depends on portal availability. `bun test src/test/sync.test.ts` exercises deterministic network-boundary fixtures, real parsing and a real stdio subprocess. Coverage includes directories, station discovery, host fallback, stored/deflated DOCX, sections, blocked access, document network failures, empty results, missing inputs, citator semantics and Worker dispatch. No lint command is configured.

Runtime dependencies remain the MCP SDK and `fast-xml-parser`. Regenerate `openapi.json` when `TOOLS` changes; the generator preserves this repository's existing deployment URLs.

Developers can also import `KenyaLawClient`, `parseAknXml`, and the eight tool handlers from the built entrypoint. Tool handlers return MCP envelopes rather than application-specific objects:

```js
import { searchCaseLaw } from "./dist/src/index.js";

const result = await searchCaseLaw({ court: "KESC", year: 2022, limit: 3 });
if (result.isError) throw new Error(result.content[0].text);
const discovery = JSON.parse(result.content[0].text);
console.log(discovery.results);
```

The low-level client returns parsed data directly. The tool handlers are the preferred interface when the caller needs the same result/error envelopes as MCP clients. The general case search envelope now uses `total_results`; legislation and Gazette searches retain `count`.

## License

MIT
