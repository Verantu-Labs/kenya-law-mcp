# Kenya Law MCP (`@verantu-labs/kenya-law-mcp`)

Independent MCP server for public Kenya Law judgments and legislation, with local stdio and Cloudflare Worker Streamable HTTP/REST support. No application backend, account, provider key, database, or external workspace is required.

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

Tools call `KenyaLawClient` directly. Court/year searches use official directories, discover station identifiers, and can inspect page 2. Other searches retain HTML and Atom-feed fallbacks. Document retrieval restricts URLs and each redirect to HTTPS Kenya Law AKN/directory paths, tries the alternate official host/source when applicable, and parses HTML/XML or supported DOCX bytes. HTML parsing removes site navigation; XML parsing includes nested AKN content. Section selection uses text-based extraction.

Requests use browser-style headers and per-request timeouts, generally 6–15 seconds. Multiple fallbacks can take longer. One-hour process-local maps cache documents/results. There is no durable storage, and these maps are not bounded LRU caches.

## HTTP and interoperability

The Worker uses the installed MCP SDK for Streamable HTTP at `/mcp` (and POST `/`), accepts MCP JSON-RPC POSTs and exposes tools at `/api/v1/<tool_name>`. `/openapi.json` contains generated REST schemas. Replies retain MCP `content` envelopes; parse `content[0].text` for tools returning JSON. HTTP 200 alone does not establish tool success: inspect `isError`.

The existing endpoint is [kenya-law-mcp.robinskarani1.workers.dev](https://kenya-law-mcp.robinskarani1.workers.dev/). Building this checkout does not deploy it. See [guide.md](guide.md) for connection examples.

Stdio and HTTP use the MCP SDK and share tool, resource and prompt handlers. HTTP notifications receive an empty 202 response; unsupported SSE GET requests return 405. The Constitution resource points to its canonical AKN identifier; case templates resolve court/year/id and statute slugs require an unambiguous search match. Individual host application UIs still require client smoke testing. The public Worker has no authentication or rate limiting; it accepts valid HTTPS browser origins for public read-only retrieval.

## Errors and inherited limitations

- HTTP 403, other upstream HTTP failures and network failures return errors rather than successful empty results. Successful empty searches still do not prove an authority is absent.
- Feed fallbacks only return matching items. Directory keyword matching/pagination remain limited. `year_from` becomes a specific year on the directory path, not a complete lower-bound date search.
- Directory rendering handles court and optional year; use `search_case_law` for station/month filtering. A directory is not judgment text.
- HTML/XML parsing, DOCX ZIP extraction and section boundaries remain heuristic. PDF extraction/OCR are not implemented: PDF-only, unrelated HTML and unreadable responses fail explicitly. Inspect returned text before citing it.
- Bulk retrieval marks each failed document and sets top-level `isError` for partial failure.
- Structured neutral citations (for example `[2022] KESC 8`) resolve directly to their AKN judgment paths and must match retrieved metadata. Other citation text requires an exact discovery-title match followed by readable document retrieval. AKN inputs require readable official text. Existence does not establish current validity, a holding or judicial treatment. `check_citator` reports `not_checked`; retrieval failures are errors, not proof of nonexistence.
- Cause-list date filtering is not implemented upstream; entries can contain default hearing/time values. Gazette retrieval uses a legacy interface. These are not verified scheduling or exhaustive notice services.
- Absolute document URLs must use HTTPS on `kenyalaw.org` or `new.kenyalaw.org`. Redirect destinations are validated before fetching. The Worker still has no application authentication/rate limiting; operating a public deployment requires separate capacity and abuse controls.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run test:live
bun run typecheck
bun run build
bun run openapi
```

`bun test` is deterministic and does not require portal access. It exercises real parsing/tool handlers with network-boundary fixtures, the production Worker transport, and real stdio subprocesses. `bun run test:live` separately checks court search, judgment retrieval, citation existence, Constitution Article 50 and legislation search against Kenya Law. It fails explicitly on blocked access; run it from the intended deployment network before release. No lint command is configured.

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
