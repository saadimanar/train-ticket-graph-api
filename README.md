# train-ticket-graph-api

**[Live demo (frontend)](https://train-ticket-graph-frontend.vercel.app)** ·
**[Live API](https://train-ticket-graph-api.vercel.app/health)** ·
**[Frontend repo](https://github.com/saadimanar/train-ticket-graph-frontend)**

A small query engine and REST API over the dependency graph of the
[Train Ticket](https://github.com/FudanSELab/train-ticket) microservices.

It loads `data/train-ticket-graph.json` once at startup, lists the **routes**
between services, and lets a client filter them, for example "routes that start
in a public service and end in a database". Responses are shaped so a graph UI can
render them directly. Filters are pluggable: a new one is a new file plus one line.

- [Try it](#try-it)
- [Quick start](#quick-start)
- [Deployment](#deployment)
- [API](#api)
- [Design](#design)
- [Adding a filter](#adding-a-filter)
- [Assumptions and known limitations](#assumptions-and-known-limitations)
- [How this would scale](#how-this-would-scale)
- [How I used AI](#how-i-used-ai)

## Try it

Example queries against the live API. Each one opens as JSON in the browser.

| Query | What it shows |
|---|---|
| [`/health`](https://train-ticket-graph-api.vercel.app/health) | `{ "status": "ok" }` |
| [`/filters`](https://train-ticket-graph-api.vercel.app/filters) | The available filters: `public`, `sink`, `vulnerable` |
| [`/graph`](https://train-ticket-graph-api.vercel.app/graph) | The full graph: 47 nodes, 98 edges |
| [`/routes?filters=vulnerable`](https://train-ticket-graph-api.vercel.app/routes?filters=vulnerable) | 82 routes through a vulnerable service |
| [`/routes?filters=sink,vulnerable&match=any`](https://train-ticket-graph-api.vercel.app/routes?filters=sink,vulnerable&match=any) | 82 routes that end in a database **or** cross a vulnerable service |
| [`/routes?filters=public,sink`](https://train-ticket-graph-api.vercel.app/routes?filters=public,sink) | **0 routes, by design**: no public service reaches a database in this data ([why](#get-routes)) |
| [`/routes?filters=unknown`](https://train-ticket-graph-api.vercel.app/routes?filters=unknown) | The `400 UNKNOWN_FILTER` error, listing the available filters |

## Quick start

Requires **Node 22+**.

```bash
npm install
npm run dev          # http://localhost:3000, restarts on change (tsx)
```

| Script | What it does |
|---|---|
| `npm run dev` | Run from source with `tsx` in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run all tests once (Vitest + supertest) |
| `npm run test:watch` | Re-run tests on change |
| `npm run test:coverage` | Tests plus a coverage report (`coverage/index.html`) |
| `npm run typecheck` | Type-check `src` and `tests` without emitting |

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port (local only; ignored on Vercel) |
| `GRAPH_DATA_PATH` | bundled `data/train-ticket-graph.json` | Load a different graph file from disk instead |
| `SINK_KINDS` | `rds,sql` | Comma-separated node kinds treated as sinks |
| `ALLOWED_ORIGINS` | `http://localhost:5173` outside production; none in production | Comma-separated exact origins allowed by CORS, e.g. `https://my-frontend.vercel.app` |

At startup the server logs each data problem it fixed, a summary, and the CORS
origins:

```
[graph] MISSING_NODE: Node "assurance-service" is referenced by edges but not defined (referenced by preserve-other-service, preserve-service); added placeholder with kind "unknown"
[graph] Loaded 47 nodes and 98 edges from bundled data/train-ticket-graph.json with 1 warning(s)
[cors] Allowed origins: http://localhost:5173
```

## Deployment

The API is deployed on **Vercel** at
<https://train-ticket-graph-api.vercel.app>, using Vercel's **Express** framework
preset. The same Express app runs locally and as one Vercel serverless function, so
no `vercel.json` is needed.

**How it works:**
- `src/index.ts` default-exports the app. On Vercel (`VERCEL=1`) it doesn't call
  `listen()`; locally it does.
- The graph is loaded once, when the module is imported. That happens once per cold
  start, so warm requests reuse the in-memory graph.
- **The data file is bundled with the function.** `src/graph/loadGraph.ts` imports
  `data/train-ticket-graph.json` with `import … with { type: "json" }`, rather than
  reading it from a path at runtime. Vercel's bundler follows imports, so the file
  always ships inside the function; a `vercel build` shows it at
  `.vercel/output/functions/index.func/data/train-ticket-graph.json`. Changing the
  data means committing the new file and redeploying.

**`ALLOWED_ORIGINS` (required in production):**
- A comma-separated list of exact origins that may call the API from a browser.
  It **must include the frontend's URL**. Here that's
  `https://train-ticket-graph-frontend.vercel.app`.
- Set it under **Project → Settings → Environment Variables**.
- **Redeploy after changing it.** Vercel applies environment variables only to new
  deployments.
- Without it, production allows no cross-origin requests, and the browser blocks the
  frontend.
- Origins must match exactly: scheme, host and port, with no wildcards and no path.
  To also allow a custom domain or a fixed preview URL, add it as another entry.

**Setting it up from scratch:**

1. Import the GitHub repo in the Vercel dashboard (**Add New → Project**). Keep the
   detected defaults: framework **Express**, build command `npm run build`.
2. Add `ALLOWED_ORIGINS` (see above).
3. Deploy. Every push to `main` deploys to production, and other branches get
   preview URLs.
4. Check it: `curl https://train-ticket-graph-api.vercel.app/health` should return
   `{"status":"ok"}`.

From the CLI instead: `vercel` (preview) or `vercel --prod`, and
`vercel env add ALLOWED_ORIGINS`.

**Notes:**
- `vercel build` bundles the function into `.vercel/output` without deploying, to
  test locally. It needs project settings, from `vercel link` or `vercel pull`.
- TypeScript is pinned to **6.0**. Vercel compiles TypeScript through the compiler's
  JavaScript API, which TypeScript 7 (the native Go port) doesn't provide; with 7,
  the build fails with `Cannot read properties of undefined (reading 'readFile')`.
- The entry file is `src/index.ts`, and the app factory is deliberately named
  `src/createApp.ts`: Vercel's detection checks `src/app.*` first, and would pick the
  wrong file. See D13 in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## API

### `GET /graph`

The **whole** graph: every node, including isolated ones and the `assurance-service`
placeholder, and every edge. It uses the same `nodes`/`edges` format and ids as
`/routes`, so a client can draw the graph once and then highlight routes from
`/routes` on top of it by id.

```json
{
  "nodes": [
    { "id": "frontend", "kind": "service", "language": "java", "path": "train-ticket/frontend",
      "publicExposed": true, "vulnerabilities": [], "missing": false },
    { "id": "prod-postgresdb", "kind": "rds", "publicExposed": false, "vulnerabilities": [],
      "metadata": { "cloud": "AWS", "engine": "postgres", "version": "9.6" }, "missing": false },
    { "id": "assurance-service", "kind": "unknown", "publicExposed": false, "vulnerabilities": [], "missing": true }
  ],
  "edges": [
    { "id": "frontend->admin-basic-info-service", "from": "frontend", "to": "admin-basic-info-service" }
  ],
  "meta": { "nodeCount": 47, "edgeCount": 98 }
}
```

The example shows only a few nodes and edges. The endpoint takes no query
parameters (any are ignored), and the response never changes while the server runs.

**Node fields:** every node in every response always has `id`, `kind`,
`publicExposed`, `vulnerabilities` and `missing`, even infrastructure nodes that
don't have those fields in the source file. A UI can rely on them for styling.
`language`, `path` and `metadata` appear only when the data has them.

### `GET /routes`

Returns the routes that match the filters, as a graph a client can render.

| Param | Default | Description |
|---|---|---|
| `filters` | none | Comma-separated filter names, e.g. `public,sink`. Repeating the param also works. No filters returns every route. |
| `match` | `all` | `all`: a route must match every filter (AND). `any`: at least one (OR). |
| `limit` | `1000` | Maximum routes returned, 1–10000. `meta.truncated` says whether more exist. |

Unknown parameters are rejected with a 400, so a typo like `?filter=public` fails
loudly instead of silently returning every route.

**Example:** `GET /routes?filters=sink,vulnerable&limit=1` (this is real output; one long
vulnerability message is shortened):

```json
{
  "nodes": [
    {
      "id": "auth-service",
      "kind": "service",
      "language": "java",
      "path": "train-ticket/ts-auth-service",
      "publicExposed": false,
      "vulnerabilities": [
        {
          "file": "train-ticket/ts-auth-service/src/main/java/auth/service/impl/UserServiceImpl.java",
          "severity": "medium",
          "message": "Detected string concatenation with a non-literal variable in a SQL statement. …",
          "metadata": { "cwe": "CWE-22: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')" }
        }
      ],
      "missing": false
    },
    {
      "id": "prod-postgresdb",
      "kind": "rds",
      "publicExposed": false,
      "vulnerabilities": [],
      "metadata": { "cloud": "AWS", "engine": "postgres", "version": "9.6" },
      "missing": false
    }
  ],
  "edges": [
    { "id": "auth-service->prod-postgresdb", "from": "auth-service", "to": "prod-postgresdb" }
  ],
  "routes": [
    { "id": "r0", "nodes": ["auth-service", "prod-postgresdb"], "edges": ["auth-service->prod-postgresdb"] }
  ],
  "meta": { "filters": ["sink", "vulnerable"], "match": "all", "routeCount": 1, "truncated": true }
}
```

- `nodes` and `edges` contain only what the matching routes use, each listed once.
  They can be passed directly to React Flow, Cytoscape, D3 and similar libraries.
- `routes` refer to nodes and edges by id, so highlighting a route is a lookup.
- Edge ids are `from->to`. Route ids (`r0`, `r1`, …) are stable only within one response.
- `missing: true` marks a placeholder for a node that edges reference but the file
  never defines (here, `assurance-service`).
- `meta.routeCount` is the number of routes in this response, not the total.

**Results on the provided data:**

| Request | Routes |
|---|---|
| `/routes` | 299 |
| `/routes?filters=public` | 5 (all from `frontend`) |
| `/routes?filters=sink` | 41 |
| `/routes?filters=vulnerable` | 82 |
| `/routes?filters=sink,vulnerable` | 41 |
| `/routes?filters=sink,vulnerable&match=any` | 82 |
| `/routes?filters=public,sink` | **0**, expected (see below) |

Two findings about this data:
- **No public route reaches a sink.** `frontend` only calls
  `admin-basic-info-service`, whose callees are all leaves without a database, and
  `gateway-service` has no edges at all.
- **Every route that ends in the database passes through a vulnerable service.**
  Only `auth-service` and `order-service` connect to `prod-postgresdb`, and both
  have findings. That's why `sink` AND `vulnerable` equals `sink` alone.

### `GET /filters`

Lists the available filters. The list is built from the registry, so new filters
appear automatically.

```json
{
  "filters": [
    { "name": "public", "description": "Route starts in a publicly exposed service" },
    { "name": "sink", "description": "Route ends in a sink (kinds: rds, sql)" },
    { "name": "vulnerable", "description": "At least one node on the route has a vulnerability" }
  ]
}
```

### `GET /health`

`200 { "status": "ok" }`

### Errors

Every error has the same shape:

```json
{ "error": { "code": "UNKNOWN_FILTER", "message": "Unknown filter(s): foo. Available filters: public, sink, vulnerable" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `UNKNOWN_FILTER` | A filter name isn't registered (all unknown names are listed) |
| 400 | `INVALID_QUERY` | Bad `match` or `limit`, or an unknown parameter on `/routes` |
| 404 | `NOT_FOUND` | Unknown path or method |
| 500 | `INTERNAL_ERROR` | Unexpected error. Details are logged, never returned. |

## Design

Each decision, with the alternatives considered and why they were rejected, is
recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md). In summary:

| # | Decision |
|---|---|
| D1 | A **route** starts at any node with outgoing edges and runs until it can't go further, with at least one edge. "Starts public" means exposure, not graph position. |
| D2 | **Traversal:** recursive depth-first search as a generator. A per-path `Set` keeps routes simple, so cycles end a route instead of looping. |
| D3 | **Combining filters:** `match=all` (default) or `any`. |
| D4 | **A filter** is a plain object `{ name, description, matches(route, graph) }` in its own file, registered in one explicit list. Configurable filters use a factory (sink kinds come from config). |
| D5 | **Pruning:** an optional `canStartAt(node)` hook narrows the start nodes (used by `public`). `matches` is still the source of truth, so the hook can only make a query faster, never wrong. |
| D6 | **API:** GET with query parameters; the response is a normalized graph plus routes as id lists. `limit` defaults to 1000, with a maximum of 10000. |
| D7 | The graph is loaded once at startup; **routes are computed per request.** |
| D8 | **Bad data:** two-level Zod validation. The top-level shape is strict, then each entry is checked separately, so one bad entry is skipped with a warning instead of failing the load. Missing nodes become placeholders; duplicate edges are merged. |
| D9 | **Layers:** `api → engine → filters / traversal → graph`. Everything below `api/` is plain TypeScript with no Express dependency. |
| D10 | **API contract:** the endpoints, error codes and expected results above. |
| D11 | **`GET /graph`** returns the full graph in the same node/edge format as `/routes`, so a client draws it once and overlays routes. |
| D12 | **CORS:** the `cors` package with an exact allow-list from `ALLOWED_ORIGINS`. The default is the Vite dev origin outside production and nothing in production. GET only. |
| D13 | **Vercel:** one entry file (`src/index.ts`) default-exports the app and only listens outside Vercel. The graph loads once per cold start; the data is bundled through an `import`. TypeScript is pinned to 6.0. |

### Data problems handled

| Problem in the file | Handling |
|---|---|
| `to` is a string, not an array (`consign-service`) | Converted to a one-item array |
| Edge targets an undefined node (`assurance-service`) | Placeholder node with `kind: "unknown"` and `missing: true`, plus a warning |
| `rds`/`sqs` nodes have no `publicExposed`; most nodes have no `vulnerabilities` | Default to `false` / `[]` |
| Duplicate nodes, edges or `from` records | First node wins; edges merged and deduplicated; warning |
| One malformed node or edge | Skipped with a warning; the rest still loads |
| File missing, not JSON, or `nodes`/`edges` not arrays | Startup fails with a clear message |

### Project structure

```
src/
  index.ts              entry point: loads the graph, default-exports the app (Vercel), listens locally
  createApp.ts          createApp({ graph, registry, allowedOrigins }): Express app without listen
  config.ts             port, data path, sink kinds, limit bounds, CORS origins
  graph/                Zod schema, types, pure buildGraph, file loader
  traversal/            findRoutes: cycle-safe DFS generator
  filters/              RouteFilter interface, registry, one file per filter, index.ts list
  engine/               query engine (pruning, match, limit) and response shaping
  api/                  routers, query schema, error handling
  shared/               Zod error formatting used by graph loading and the API
tests/
  fixtures/             small hand-built graphs (cycles, missing node, complete graph, ladder)
  unit/                 graph loading, traversal, each filter, registry, engine, schema, response
  api/                  supertest: real data, fixture graphs, /graph, CORS, Vercel entry
docs/DECISIONS.md       design decisions
```

`createApp` receives the graph and the registry instead of loading them itself.
That makes the API tests run the real app against small graphs, including one with
a cycle and one with a missing node. 176 tests; coverage is about 99% of lines in `src/`.

## Adding a filter

Example: "routes that pass through a message queue".

1. Create `src/filters/crossesQueue.ts`:

   ```ts
   import type { RouteFilter } from "./types.js";

   export const crossesQueueFilter: RouteFilter = {
     name: "crosses-queue",
     description: "Route passes through a message queue (sqs)",
     matches: (route, graph) => route.some((id) => graph.nodes.get(id)?.kind === "sqs"),
   };
   ```

2. Add `crossesQueueFilter` to the list in `createDefaultRegistry()` in
   `src/filters/index.ts`.
3. Optionally:
   - Add `canStartAt(node, graph)` if the filter can rule out start nodes.
   - Use a factory function (like `createSinkFilter`) if the filter needs configuration.
   - Add a unit test.

Nothing else changes: `GET /filters` lists the new filter and `?filters=crosses-queue`
works. A test fails if a file in `src/filters/` is not registered, and the registry
rejects duplicate or invalid names at startup.

## Assumptions and known limitations

- **Single-node routes are excluded.** So the isolated public `gateway-service`
  never appears in results.
- **"Ends in a sink" means the last node is a sink.** A route that passes through a
  database and continues doesn't match. In this data, sinks are always leaves.
- **Routes overlap.** Every node can start a route, so a route can also appear as
  the tail of a longer one (D1).
- **Placeholder nodes** (`kind: "unknown"`) are never public, never sinks and never
  vulnerable.
- **Findings are passed through unchanged.** For example, `auth-service`'s finding
  describes SQL injection, but its CWE metadata says CWE-22 (Path Traversal). The API
  doesn't try to reconcile them.
- **Maximum route depth.** Nested generators overflow the stack on a single route of
  about 2,900 nodes (measured). That would return a 500; the server keeps running.
  The longest route in this data has 6 nodes.
- **No total count.** `meta.routeCount` counts the returned routes. Computing a total
  would mean listing every route, which `limit` exists to avoid.
- **Filters have no per-request parameters** (e.g. a minimum severity), and filters
  can't be combined into expressions like `public AND (sink OR vulnerable)`. Both can
  be added without changing existing filters (see D3 and D4).
- **Static data.** The file is read once; a restart, or a new deployment on Vercel,
  picks up changes. There is no authentication, rate limiting or request timeout.
- **CORS origins are exact matches.** Vercel preview URLs change on every
  deployment, so a preview frontend must be added to `ALLOWED_ORIGINS` explicitly
  (or use a fixed branch domain). Wildcards like `*.vercel.app` are deliberately not
  supported: anyone can deploy to `vercel.app`.

## How this would scale

The number of routes can grow exponentially with graph size, so the main risk is
the amount of work per query, not memory for the graph itself. What's already in
place:
- Routes are produced lazily, so `limit` stops the work early.
- The default and maximum limits stop an unfiltered query from trying to return
  millions of routes.
- `public` prunes start nodes.

For a much larger graph, in order of value:

1. **Branch pruning.** Precompute once, at startup, which nodes can reach a sink
   (a reverse search from all sinks), then skip branches that can't. That makes
   `sink` and `public,sink` queries proportional to the relevant part of the graph.
   It fits as a second optional hook (`canContinue`) next to `canStartAt` (D5).
2. **A work budget per query.** Cap nodes visited or time spent, and return
   `truncated: true` with a reason. `limit` caps output, but a selective filter can
   still walk a lot before finding matches.
3. **Pagination or streaming.** Use a cursor (the generator can resume), or stream
   NDJSON (newline-delimited JSON), instead of one large JSON body.
4. **Memoizing routes per node.** Shared subgraphs, like `seat-service →
   order-service → …`, are walked again from every caller. Caching the routes below
   each node avoids that. Plain caching is only correct on graphs without cycles, so
   it would need a guard: enable it only when the graph has no cycles, or cache per
   strongly connected component (a group of nodes that can all reach each other). I
   deliberately didn't build it: queries here take under a millisecond, and the guard
   is the riskiest part of the design.
5. **Iterative DFS** with an explicit stack, to remove the ~2,900-node depth limit.
   It's a drop-in replacement: the existing tests define the expected order.
6. **Beyond one process:** move CPU-heavy queries to worker threads, cache responses
   per query (the data is static, so the cache never needs clearing), or store the
   graph in a graph database (e.g. Neo4j) once it no longer fits in memory.

## How I used AI

TODO
