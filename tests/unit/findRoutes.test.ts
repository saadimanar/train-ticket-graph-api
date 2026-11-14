import { describe, expect, it } from "vitest";
import { loadBundledGraph } from "../../src/graph/loadGraph.js";
import { neighbors, type Graph, type Route } from "../../src/graph/types.js";
import { findRoutes, findRoutesFrom } from "../../src/traversal/findRoutes.js";
import {
  complete,
  diamond,
  ladder,
  linear,
  makeGraph,
  missingTarget,
  selfLoop,
  triangle,
  twoCycle,
} from "../fixtures/graphs.js";

const all = (graph: Graph, startNodes?: string[]) => [...findRoutes(graph, startNodes ? { startNodes } : {})];

describe("findRoutes: route definition (D1)", () => {
  it("starts at every node with outgoing edges and runs to a leaf", () => {
    expect(all(linear())).toEqual([
      ["a", "b", "c"],
      ["b", "c"],
    ]);
  });

  it("follows every branch, in adjacency order", () => {
    expect(all(diamond())).toEqual([
      ["a", "b", "d"],
      ["a", "c", "d"],
      ["b", "d"],
      ["c", "d"],
    ]);
  });

  it("never yields single-node routes (leaves and isolated nodes)", () => {
    expect(all(makeGraph({}, { isolated: ["x"] }))).toEqual([]);
    expect([...findRoutesFrom(linear(), "c")]).toEqual([]);
  });

  it("returns nothing for an empty graph", () => {
    expect(all(makeGraph({}))).toEqual([]);
  });
});

describe("findRoutes: cycles (D2)", () => {
  it("ends a route when every neighbor is already on it (D2 example)", () => {
    expect(all(twoCycle())).toEqual([
      ["A", "B"],
      ["A", "C"],
      ["B", "A", "C"],
    ]);
  });

  it("terminates on a 3-cycle, producing one route per start", () => {
    expect(all(triangle())).toEqual([
      ["a", "b", "c"],
      ["b", "c", "a"],
      ["c", "a", "b"],
    ]);
  });

  it("ignores self-loops", () => {
    expect(all(selfLoop())).toEqual([["a", "b"]]);
    expect(all(makeGraph({ a: ["a"] }))).toEqual([]);
  });

  it("terminates on a densely cyclic graph (complete graph K5 → 5! routes)", () => {
    const routes = all(complete(5));
    expect(routes).toHaveLength(120);
    for (const route of routes) expect(new Set(route).size).toBe(5);
  });
});

describe("findRoutes: robustness", () => {
  it("still routes through a target that is missing from the node map", () => {
    expect(all(missingTarget())).toEqual([
      ["a", "ghost"],
      ["a", "b"],
    ]);
  });

  it("is lazy: can take the first routes of a graph with 2^40 routes", () => {
    const first: Route[] = [];
    for (const route of findRoutes(ladder(40), { startNodes: ["s"] })) {
      first.push(route);
      if (first.length === 3) break;
    }
    expect(first).toHaveLength(3);
    expect(first[0]).toHaveLength(41);
  });

  it("yields frozen copies, so callers cannot corrupt later routes", () => {
    const routes = all(diamond());
    expect(Object.isFrozen(routes[0])).toBe(true);
    expect(routes[0]).not.toBe(routes[1]);
  });
});

describe("findRoutes: startNodes option", () => {
  it("only starts from the given nodes, in the given order, ignoring duplicates", () => {
    expect(all(diamond(), ["c", "a", "c"])).toEqual([
      ["c", "d"],
      ["a", "b", "d"],
      ["a", "c", "d"],
    ]);
  });

  it("yields nothing for unknown start nodes", () => {
    expect(all(diamond(), ["nope"])).toEqual([]);
  });
});

describe("findRoutes on the provided data", () => {
  it("produces the 299 routes from D1, all valid", async () => {
    const graph = loadBundledGraph({ info: () => {}, warn: () => {} });
    const routes = all(graph);

    expect(routes).toHaveLength(299);
    const isValid = (route: Route) =>
      route.length >= 2 &&
      new Set(route).size === route.length &&
      route.every((id, i) => i === 0 || neighbors(graph, route[i - 1]!).includes(id)) &&
      neighbors(graph, route.at(-1)!).length === 0;
    expect(routes.filter((r) => !isValid(r))).toEqual([]);

    // Unique routes.
    expect(new Set(routes.map((r) => r.join(">"))).size).toBe(299);
    // The placeholder is reachable.
    expect(routes).toContainEqual(["preserve-service", "assurance-service"]);
  });
});
