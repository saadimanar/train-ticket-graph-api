import { describe, expect, it } from "vitest";
import { toRoutesResponse } from "../../src/engine/toResponse.js";
import { makeGraph } from "../fixtures/graphs.js";

describe("toRoutesResponse", () => {
  const graph = makeGraph(
    { a: ["b", "c"], b: ["d"], c: ["d"] },
    { nodes: { a: { publicExposed: true, language: "java" }, d: { kind: "rds", metadata: { engine: "pg" } } } },
  );

  const response = toRoutesResponse(graph, {
    filters: ["public"],
    match: "all",
    routes: [
      ["a", "b", "d"],
      ["a", "c", "d"],
    ],
    truncated: true,
  });

  it("lists each node once, in order of first appearance", () => {
    expect(response.nodes.map((n) => n.id)).toEqual(["a", "b", "d", "c"]);
    expect(response.nodes[0]).toEqual({
      id: "a",
      kind: "service",
      language: "java",
      publicExposed: true,
      vulnerabilities: [],
      missing: false,
    });
    expect(response.nodes[2]).toMatchObject({ kind: "rds", metadata: { engine: "pg" } });
  });

  it("lists each edge once with a from->to id", () => {
    expect(response.edges).toEqual([
      { id: "a->b", from: "a", to: "b" },
      { id: "b->d", from: "b", to: "d" },
      { id: "a->c", from: "a", to: "c" },
      { id: "c->d", from: "c", to: "d" },
    ]);
  });

  it("describes routes as node and edge id lists", () => {
    expect(response.routes).toEqual([
      { id: "r0", nodes: ["a", "b", "d"], edges: ["a->b", "b->d"] },
      { id: "r1", nodes: ["a", "c", "d"], edges: ["a->c", "c->d"] },
    ]);
  });

  it("every id referenced by a route is present in nodes/edges", () => {
    const nodeIds = new Set(response.nodes.map((n) => n.id));
    const edgeIds = new Set(response.edges.map((e) => e.id));
    for (const route of response.routes) {
      expect(route.nodes.every((id) => nodeIds.has(id))).toBe(true);
      expect(route.edges.every((id) => edgeIds.has(id))).toBe(true);
    }
  });

  it("fills meta from the query result", () => {
    expect(response.meta).toEqual({ filters: ["public"], match: "all", routeCount: 2, truncated: true });
  });

  it("returns empty collections for no routes", () => {
    const empty = toRoutesResponse(graph, { filters: [], match: "any", routes: [], truncated: false });
    expect(empty).toEqual({
      nodes: [],
      edges: [],
      routes: [],
      meta: { filters: [], match: "any", routeCount: 0, truncated: false },
    });
  });

  it("marks a node missing from the graph map as an unknown placeholder", () => {
    const res = toRoutesResponse(makeGraph({ a: ["ghost"] }, { omit: ["ghost"] }), {
      filters: [],
      match: "all",
      routes: [["a", "ghost"]],
      truncated: false,
    });
    expect(res.nodes[1]).toMatchObject({ id: "ghost", kind: "unknown", missing: true });
  });
});
