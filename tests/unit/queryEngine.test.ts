import { describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { createQueryEngine, selectStartNodes, type MatchMode } from "../../src/engine/queryEngine.js";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { createRegistry, UnknownFilterError } from "../../src/filters/registry.js";
import type { RouteFilter } from "../../src/filters/types.js";
import { loadGraph } from "../../src/graph/loadGraph.js";
import type { Graph, Route } from "../../src/graph/types.js";
import { findRoutes } from "../../src/traversal/findRoutes.js";
import { makeGraph } from "../fixtures/graphs.js";

const vuln = [{ severity: "high" }];

/**
 * web(public) → api → db(rds)
 *               api → cache
 * worker → api
 * worker → db
 * api has a vulnerability.
 */
const fixture = () =>
  makeGraph(
    { web: ["api"], api: ["db", "cache"], worker: ["api", "db"] },
    { nodes: { web: { publicExposed: true }, db: { kind: "rds" }, api: { vulnerabilities: vuln } } },
  );

const engineFor = (graph: Graph) => createQueryEngine(graph, createDefaultRegistry({ sinkKinds: ["rds"] }));
const ids = (routes: Route[]) => routes.map((r) => r.join(">"));

describe("query engine: filters", () => {
  const engine = engineFor(fixture());

  it("returns every route without filters", () => {
    const result = engine.query();
    expect(ids(result.routes)).toEqual([
      "web>api>db",
      "web>api>cache",
      "api>db",
      "api>cache",
      "worker>api>db",
      "worker>api>cache",
      "worker>db",
    ]);
    expect(result).toMatchObject({ filters: [], match: "all", truncated: false });
  });

  it.each([
    [["public"], ["web>api>db", "web>api>cache"]],
    [["sink"], ["web>api>db", "api>db", "worker>api>db", "worker>db"]],
    [["vulnerable"], ["web>api>db", "web>api>cache", "api>db", "api>cache", "worker>api>db", "worker>api>cache"]],
    [["public", "sink"], ["web>api>db"]],
    [["sink", "vulnerable"], ["web>api>db", "api>db", "worker>api>db"]],
  ])("filters=%j combines with AND by default", (filters, expected) => {
    expect(ids(engine.query({ filters }).routes)).toEqual(expected);
  });

  it("combines with OR when match=any", () => {
    const result = engine.query({ filters: ["public", "sink"], match: "any" });
    expect(ids(result.routes)).toEqual(["web>api>db", "web>api>cache", "api>db", "worker>api>db", "worker>db"]);
    expect(result.match).toBe("any");
  });

  it("returns every route without filters even when match=any", () => {
    expect(engine.query({ match: "any" }).routes).toHaveLength(7);
  });

  it("deduplicates requested filter names", () => {
    expect(engine.query({ filters: ["sink", "sink"] }).filters).toEqual(["sink"]);
  });

  it("throws UnknownFilterError for unknown names", () => {
    expect(() => engine.query({ filters: ["public", "nope"] })).toThrow(UnknownFilterError);
  });
});

describe("query engine: limit", () => {
  const engine = engineFor(fixture());

  it("stops at the limit and reports truncation", () => {
    const result = engine.query({ filters: ["sink"], limit: 2 });
    expect(ids(result.routes)).toEqual(["web>api>db", "api>db"]);
    expect(result.truncated).toBe(true);
  });

  it("is not truncated when the limit equals the number of matches", () => {
    const result = engine.query({ filters: ["sink"], limit: 4 });
    expect(result.routes).toHaveLength(4);
    expect(result.truncated).toBe(false);
  });
});

describe("query engine: start-node pruning (D5)", () => {
  /** Records which start nodes the traversal actually visited, via matches() calls. */
  function spyFilter(name: string, opts: { canStartAt?: (id: string) => boolean } = {}) {
    const startsSeen = new Set<string>();
    const filter: RouteFilter = {
      name,
      description: name,
      matches(route) {
        startsSeen.add(route[0]!);
        return true;
      },
      ...(opts.canStartAt && { canStartAt: (node) => opts.canStartAt!(node.id) }),
    };
    return { filter, startsSeen };
  }

  it("match=all: only walks from nodes accepted by the hook", () => {
    const pruning = spyFilter("pruning", { canStartAt: (id) => id === "worker" });
    const engine = createQueryEngine(fixture(), createRegistry([pruning.filter]));

    expect(ids(engine.query({ filters: ["pruning"] }).routes)).toEqual(["worker>api>db", "worker>api>cache", "worker>db"]);
    expect([...pruning.startsSeen]).toEqual(["worker"]);
  });

  it("match=all: filters without a hook don't restrict, filters with one do", () => {
    const { filter: plain } = spyFilter("plain");
    const { filter: pruning } = spyFilter("pruning", { canStartAt: (id) => id === "web" });
    expect(selectStartNodes(fixture(), [plain, pruning], "all")).toEqual(["web"]);
  });

  it("match=any: prunes to the union when every filter has a hook", () => {
    const { filter: a } = spyFilter("a", { canStartAt: (id) => id === "web" });
    const { filter: b } = spyFilter("b", { canStartAt: (id) => id === "worker" });
    expect(selectStartNodes(fixture(), [a, b], "any")).toEqual(["web", "worker"]);
  });

  it("match=any: does not prune if any filter lacks a hook", () => {
    const { filter: plain } = spyFilter("plain");
    const { filter: pruning } = spyFilter("pruning", { canStartAt: (id) => id === "web" });
    expect(selectStartNodes(fixture(), [plain, pruning], "any")).toBeUndefined();
  });

  it("does not prune without filters", () => {
    expect(selectStartNodes(fixture(), [], "all")).toBeUndefined();
  });
});

describe("query engine on the provided data", async () => {
  const graph = await loadGraph(config.dataPath, { info: () => {}, warn: () => {} });
  const registry = createDefaultRegistry();
  const engine = createQueryEngine(graph, registry);

  it.each([
    [[], "all", 299],
    [["vulnerable"], "all", 82],
    [["sink"], "all", 41],
    [["public"], "all", 5],
    [["sink", "vulnerable"], "all", 41],
    [["sink", "vulnerable"], "any", 82],
    [["public", "sink"], "all", 0], // expected: no public route reaches a sink
  ] as const)("filters=%j match=%s → %i routes", (filters, match, count) => {
    expect(engine.query({ filters, match }).routes).toHaveLength(count);
  });

  it("every public route starts at frontend (gateway-service has no edges)", () => {
    expect(new Set(engine.query({ filters: ["public"] }).routes.map((r) => r[0]))).toEqual(new Set(["frontend"]));
  });

  it("pruning never changes results: equals brute force for every filter combination", () => {
    const names = registry.list().map((f) => f.name);
    const subsets = names.reduce<string[][]>((acc, n) => [...acc, ...acc.map((s) => [...s, n])], [[]]);
    const everyRoute = [...findRoutes(graph)];

    for (const filters of subsets) {
      for (const match of ["all", "any"] as MatchMode[]) {
        const resolved = registry.resolve(filters);
        const expected = everyRoute.filter(
          (r) =>
            resolved.length === 0 ||
            (match === "all" ? resolved.every((f) => f.matches(r, graph)) : resolved.some((f) => f.matches(r, graph))),
        );
        expect(ids(engine.query({ filters, match }).routes), `${filters.join(",")} ${match}`).toEqual(ids(expected));
      }
    }
  });
});

describe("extensibility", () => {
  it("runs a brand-new filter with no engine changes", () => {
    const crossesQueue: RouteFilter = {
      name: "crosses-queue",
      description: "Route passes through a message queue",
      matches: (route, graph) => route.some((id) => graph.nodes.get(id)?.kind === "sqs"),
    };
    const graph = makeGraph({ a: ["q", "b"], q: ["c"] }, { nodes: { q: { kind: "sqs" } } });
    const engine = createQueryEngine(graph, createRegistry([crossesQueue]));

    expect(ids(engine.query({ filters: ["crosses-queue"] }).routes)).toEqual(["a>q>c", "q>c"]);
  });
});
