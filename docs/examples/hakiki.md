# Hakiki procurement review

[Hakiki](https://github.com/RobinsKarani/hakiki) uses Kenya Law MCP to retrieve legislation while preparing a draft review of selected tender and synthetic supplier documents. Its own Procurement MCP handles findings and report generation; Kenya Law MCP supplies source text.

The following flow was checked against Hakiki revision [`f8ad836`](https://github.com/RobinsKarani/hakiki/tree/f8ad83654e2bc584fae0d1424c1464b1d9754df8):

1. [Setup](https://github.com/RobinsKarani/hakiki/blob/f8ad83654e2bc584fae0d1424c1464b1d9754df8/scripts/setup.ts) clones this public repository at a pinned commit and builds `dist/src/index.js`. It uses local stdio, not the hosted Worker.
2. [The MCP client](https://github.com/RobinsKarani/hakiki/blob/f8ad83654e2bc584fae0d1424c1464b1d9754df8/src/mcp.ts) starts that entrypoint with Node, connects using the official SDK and discovers tools with `listTools`. Its call wrapper logs tool inputs, outputs, timestamps and errors.
3. [The review host](https://github.com/RobinsKarani/hakiki/blob/f8ad83654e2bc584fae0d1424c1464b1d9754df8/src/review.ts) exposes `search_legislation` and `get_akn_document` to the model. It requires focused PPADA provision text and Constitution Article 227 before drafting. Search results alone do not satisfy that check.
4. Retrieved passages receive source IDs, hashes and retrieval times. [Citation validation](https://github.com/RobinsKarani/hakiki/blob/f8ad83654e2bc584fae0d1424c1464b1d9754df8/src/workspace.ts) checks stored text, line ranges and exact quotes, and rejects heading-only legal references. [Human review](https://github.com/RobinsKarani/hakiki/blob/f8ad83654e2bc584fae0d1424c1464b1d9754df8/src/human-review.ts) is a separate action against the unchanged draft.

Developers can reuse this separation: discover and call the public MCP tools, preserve returned text for citations, and keep application decisions and approval in their own code. Quote matching does not establish legal relevance or correctness.

**Live check, 16 October 2026:** the pinned server connected over stdio, negotiated protocol `2026-07-28` and listed eight tools. Legislation search, PPADA section 79 and Article 227 retrieval returned upstream HTTP 403 errors. No paid model review was run. This check verifies transport and error handling, not a completed review or current source availability.
