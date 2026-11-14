# Design Decisions

Each entry records what we decided and why. Alternatives considered are noted briefly.

## D1. What counts as a route

**Decision:** A route is a path that starts at **any node that has outgoing edges** and
continues until it reaches a node it cannot extend from (a leaf). Every route has
**at least one edge**; single-node routes are excluded.

**Why:**
- "Starts in a public service" should mean exactly that, regardless of whether the
  service also has callers. Restricting starts to nodes with no incoming edges
  (option A) would silently hide a public service that is also called internally.
- "Ends in a sink" means the route really terminates there, not merely passes through
  it, which is why we did not enumerate every subpath (option C).
- Single-node routes such as `[prod-postgresdb]` or the isolated `[gateway-service]`
  would trivially match "ends in sink" / "starts public" and add noise, not insight.

**Consequences / assumptions:**
- Some redundancy: a route may also appear as the tail of a longer route.
- An isolated public service (e.g. `gateway-service`) never appears in results.
- On the current data: 299 routes, 82 contain a vulnerable node, 41 end in a sink.

**Rejected:** (A) only maximal paths from nodes with no incoming edges (217 routes);
(C) every subpath of length ≥ 2 (440 routes).

## D2. Traversal and cycle handling

**Decision:** Recursive depth-first search implemented as a generator
(`function*`) that yields one route at a time. A `Set` of the nodes on the current
path prevents revisiting. A route ends when the current node has no neighbour
that is not already on the path (a true leaf, or every neighbour would close a cycle).

**Why:** shortest, most readable option; cycle-safe because only simple paths are
produced; the generator lets callers stop early or apply a limit.

**Known limit (measured):** recursion depth equals route length, and nested `yield*`
generators overflow the stack on a single route of roughly 2,900 nodes (plain recursion
manages ~10k). The longest route in this data has 7 nodes, and a ~2,900-service call
chain is unrealistic, so we keep the simpler recursive version and document the limit.
If hit, the `RangeError` becomes a 500 response; the server keeps running.

**Example:** edges `A→B`, `B→A`, `A→C`, starting at `A` → routes `A→C` and `A→B`.

**Rejected:** (B) iterative DFS: same behaviour, more code; can replace (A) later
without changing callers. (C) BFS: holds all partial paths in memory for no benefit.

**Possible future optimisation (not implemented):** memoising routes per node; see D7.

## D3. Combining multiple filters

**Decision:** Filters combine according to a `match` parameter: `all` (AND, the
default) or `any` (OR). Example: `?filters=sink,vulnerable&match=any`. With no
filters, every route is returned regardless of `match`.

**Why:**
- AND is what the assignment implies, so it is the default.
- OR covers a realistic security question ("anything risky": ends in a sink *or*
  has a vulnerability) at almost no cost: the engine switches between `every` and
  `some`.
- Filters stay simple yes/no tests on a single route, so this choice does not
  leak into filter implementations.

**Rejected:** (A) AND only: cannot express "any of these". (C) a full boolean
expression language (`public AND (sink OR vulnerable)`, NOT): needs a parser or
tree validator; overkill for three filters. Because filters are plain yes/no tests,
an expression layer can be added later without touching them.

## D4. Filter definition and registration

**Decision:** A filter is a plain object implementing

```ts
interface RouteFilter {
  name: string;          // used in ?filters=…
  description: string;   // shown by GET /filters
  matches(route: Route, graph: Graph): boolean;
}
```

One file per filter in `src/filters/`. Configurable filters are created by a factory
(e.g. `createSinkFilter({ kinds })`), with configuration (sink kinds) kept in a
config module rather than hard-coded in the filter. `src/filters/index.ts` builds the
registry from an explicit list; the registry rejects duplicate names at startup.

Adding a filter = new file + one line in the registry list. The engine and API only
talk to the registry, so they never change.

Filters are configured at registration time only; there are **no per-request filter
parameters**. A variant (e.g. `vulnerable-high`) can be registered as a separate
filter; true per-request params could later be added via an optional Zod params
schema on the filter.

**Why:** explicit, type-checked, all filters visible in one place, and tests can
build their own registry with fake filters. A test asserting every filter file is
registered guards against forgetting the registration line.

**Rejected:** (B) auto-discovery via dynamic `import()` of the folder: implicit,
async startup, `.ts`/`.js` path differences between `tsx` and `dist/`, nondeterministic
order, hard to isolate in tests. (C) class decorators / self-registering modules:
still requires an import somewhere, relies on import side effects and a global
mutable registry, and needs decorator config.

## D5. Early pruning via an optional start-node hook

**Decision:** `RouteFilter` gets an optional method
`canStartAt?(node: GraphNode, graph: Graph): boolean`. The engine uses it to
narrow the set of start nodes before traversal:

- `match=all`: start only at nodes accepted by **every** selected filter that
  defines the hook (filters without it don't restrict).
- `match=any`: prune only if **every** selected filter defines the hook; start at
  the **union** of nodes they accept. Otherwise, no pruning.

`matches()` still runs on every produced route and remains the single source of
truth. The hook is purely an optimisation: a missing or overly permissive hook can
only make a query slower, never wrong.

Of the initial filters only `public` implements it.

**Why:** big win for the most common security question ("what is reachable from
public entry points?") for a few lines of code; filters that cannot prune need do
nothing.

**Rejected:** (A) no pruning: every query costs a full enumeration. (C) also a
branch hook `canContinue?(partialRoute)` (e.g. sink-reachability pruning): larger
speedups but more complex, cycle-sensitive precomputation inside filters, and awkward
semantics under `match=any`. It can be added later as another optional hook;
described in the README under scaling.

## D6. API shape

**Decision:**
- Endpoints: `GET /routes`, `GET /filters` (name + description from the registry),
  `GET /health`.
- `GET /routes` query params:
  - `filters`: comma-separated filter names (`filters=public,sink`); empty/missing
    means no filters.
  - `match`: `all` (default) or `any` (see D3).
  - `limit`: positive integer, **default 1000, maximum 10000** (larger values → 400).
    If the cap cuts the result, `meta.truncated` is `true`.
- Response is a **normalised graph plus routes as ID lists**:
  - `nodes`: unique nodes appearing in the matching routes (full node data).
  - `edges`: unique edges appearing in the matching routes, `id = "from->to"`.
  - `routes`: `{ id, nodes: [nodeId…], edges: [edgeId…] }`.
  - `meta`: `{ filters, match, routeCount, truncated }`.
- Route ids (`r0`, `r1`, …) are stable only within one response. Edge ids
  `from->to` are unique for any input, because graph building merges records with the
  same `from` and drops duplicate targets (D8).

**Why:**
- `nodes` + `edges` can be passed directly to any graph-rendering library;
  highlighting a route is an id lookup; node data is never duplicated.
- GET because the query is read-only, small, cacheable and shareable as a URL.
- Comma-separated filters are concise and easy to type.
- `limit` is nearly free with the generator-based traversal (D2). A default cap
  is required, not optional: without one, an unfiltered `GET /routes` on a large
  graph could try to build millions of routes and exhaust the server. `meta.truncated`
  tells the client the result was cut.

**Rejected:** (B) routes with embedded node objects: heavy duplication and the
client has to rebuild the graph. (C) a library-specific format such as Cytoscape
`elements`: couples the API to one frontend; trivially derived from the chosen format.

## D7. Compute routes per request

**Decision:** The in-memory graph (node map + adjacency list) is built once at
startup; **routes are computed per request**: pick start nodes (D5 hook), walk with
the DFS generator (D2), apply filters, stop at `limit`.

**Why:** memory stays proportional to the graph, not the route count (which can grow
exponentially); pruning and `limit` actually save work; on this data a query takes
well under a millisecond.

**Rejected:** (B) precompute all routes at startup: memory and startup time scale with
route count, could prevent the server from starting on a large graph, and makes
pruning/limit pointless. (C) per-request result cache (LRU keyed by query): adds a
layer this data doesn't need.

**Possible future optimisation (not implemented):** memoise the routes below each node
to avoid re-walking shared subtrees. Plain memoisation is only correct on acyclic
graphs, so it would need a guard (enable only when acyclic, or cache per strongly
connected component). Not worth the complexity and risk here: queries already take
under a millisecond. Described in the README under scaling.

## D8. Handling bad data

**Decision:** Validate the file with Zod at startup; normalise recoverable quirks and
log a warning; fail fast only when the file as a whole is unusable.

Validation has **two levels**, so one bad entry cannot fail the whole parse:
1. Top-level shape, strict: the file is an object whose `nodes` and `edges` are
   arrays (entries typed as `unknown`). Failure → startup error.
2. Each node and edge entry separately with `safeParse`; failures are skipped with a
   warning that names the entry index and the Zod issue.

| Situation | Handling |
|---|---|
| `to` is a string | Normalised to a one-element array in the schema (valid format, no warning). |
| `publicExposed` / `vulnerabilities` missing | Default to `false` / `[]`. `language`, `path`, `metadata` stay optional. |
| `kind` | Any string (not an enum); sink kinds come from config (D4). |
| Edge target not in `nodes` (e.g. `assurance-service`) | **Placeholder node** `{ id, kind: "unknown", missing: true }` + warning. Not public, not a sink, no vulnerabilities. |
| Several edge records with the same `from` | Merged; duplicate targets dropped with a warning. |
| Duplicate node names | First wins; warning. |
| Self-loop `A→A` | Kept; harmless under the cycle rule (D2). |
| A single malformed node/edge entry | Skipped with a warning. |
| File missing, not JSON, or `nodes`/`edges` not arrays | Startup fails with a clear error. |

**Clarifications made during implementation:**
- An undefined `from` node also gets a placeholder (same reasoning as for targets).
- The vulnerability schema is lenient (all fields optional, unknown fields kept): an
  unusual finding must not cause its whole node to be dropped, which would hide it.
- An edge record is validated as a unit: one invalid target skips that record.
- Warnings carry a code (`INVALID_NODE`, `INVALID_EDGE`, `DUPLICATE_NODE`,
  `DUPLICATE_EDGE`, `MISSING_NODE`) so tests and logs can match on them.

**Why (placeholder node):** no information is lost. A call to a service we have no
data about is itself a security-relevant fact, and `missing: true` lets clients render
it distinctly. Filters treat it safely by default.

**Rejected:** (B) drop edges to unknown nodes: silently hides the
`preserve*-service → assurance-service` routes. (C) refuse to start: violates
"log warnings, don't crash"; one missing node would take the whole API down.

## D9. Project structure

```
src/
  index.ts            # loads graph, builds registry, starts the server
  app.ts              # createApp({ graph, registry }): Express app, no listen
  config.ts           # port, data path, sink kinds
  graph/              # Zod schema, types, pure buildGraph, file loader
  traversal/          # findRoutes DFS generator (no Express dependency)
  filters/            # RouteFilter interface, registry, one file per filter, index.ts list
  engine/             # query engine (pruning, match, limit) + response shaping
  api/                # routers, query-param schema, error handling
tests/
  fixtures/           # small hand-built graphs
  unit/               # graph building, traversal, filters, registry, engine
  api/                # supertest
```

**Why:** layers depend only downward (api → engine → filters/traversal → graph), so
everything below `api/` is plain TypeScript and unit-testable without HTTP.
`createApp` receives the graph and registry as arguments (dependency injection), so
API tests can run the real app against small fixture graphs.

## D10. API contract

- `GET /health` → `200 { "status": "ok" }`.
- `GET /filters` → `200 { "filters": [{ "name", "description" }] }`, built from the registry.
- `GET /routes?filters=a,b&match=all|any&limit=N` → `200 { nodes, edges, routes, meta }` (D6).
  Filter names: `public`, `sink`, `vulnerable`.
- Errors share one shape: `{ "error": { "code", "message" } }`.
  - `400 UNKNOWN_FILTER`: message lists the unknown and the available filter names.
  - `400 INVALID_QUERY`: bad `match`, or `limit` not an integer in 1–10000; message
    derived from Zod issues.
  - `404 NOT_FOUND` for unknown paths.
  - `500 INTERNAL_ERROR` with a generic message; details are logged only.

**Expected results on the provided data:** no filters 299 routes; `vulnerable` 82;
`sink` 41; `sink,vulnerable` 41; `sink,vulnerable&match=any` 82; `public` 5;
`public,sink` 0 (expected: `frontend`'s routes never reach a sink and
`gateway-service` has no edges). Every route ending in `prod-postgresdb` passes through
a vulnerable node, so `sink` ⊂ `vulnerable` on this data.
