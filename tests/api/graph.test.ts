import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/createApp.js";
import type { GraphResponse, NodeDto, RoutesResponse } from "../../src/engine/toResponse.js";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { loadBundledGraph } from "../../src/graph/loadGraph.js";

const silent = { info: () => {}, warn: () => {} };
const app = createApp({ graph: loadBundledGraph(silent), registry: createDefaultRegistry() });

/** The fields a UI needs to style a node must always be present with the right types. */
function expectStylable(node: NodeDto): void {
  expect(typeof node.id).toBe("string");
  expect(typeof node.kind).toBe("string");
  expect(typeof node.publicExposed).toBe("boolean");
  expect(Array.isArray(node.vulnerabilities)).toBe(true);
  expect(typeof node.missing).toBe("boolean");
}

describe("GET /graph", () => {
  it("returns every node, including isolated ones and the placeholder", async () => {
    const res = await request(app).get("/graph");
    const body = res.body as GraphResponse;

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ nodeCount: 47, edgeCount: 98 });
    expect(body.nodes).toHaveLength(47);
    expect(body.edges).toHaveLength(98);

    const ids = body.nodes.map((n) => n.id);
    for (const isolated of ["gateway-service", "avatar-service", "news-service", "ticket-office-service", "ui-dashboard"]) {
      expect(ids).toContain(isolated);
    }
    expect(body.nodes.find((n) => n.id === "assurance-service")).toEqual({
      id: "assurance-service",
      kind: "unknown",
      publicExposed: false,
      vulnerabilities: [],
      missing: true,
    });
  });

  it("has unique ids and edges that reference existing nodes", async () => {
    const body = (await request(app).get("/graph")).body as GraphResponse;
    const nodeIds = new Set(body.nodes.map((n) => n.id));

    expect(nodeIds.size).toBe(body.nodes.length);
    expect(new Set(body.edges.map((e) => e.id)).size).toBe(body.edges.length);
    for (const edge of body.edges) {
      expect(edge.id).toBe(`${edge.from}->${edge.to}`);
      expect(nodeIds).toContain(edge.from);
      expect(nodeIds).toContain(edge.to);
    }
  });

  it("uses the same node and edge objects as /routes, so routes can be overlaid", async () => {
    const graph = (await request(app).get("/graph")).body as GraphResponse;
    const routes = (await request(app).get("/routes")).body as RoutesResponse;
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    const edgesById = new Map(graph.edges.map((e) => [e.id, e]));

    for (const node of routes.nodes) expect(nodesById.get(node.id)).toEqual(node);
    for (const edge of routes.edges) expect(edgesById.get(edge.id)).toEqual(edge);
    // /routes without filters uses every edge (isolated nodes have none).
    expect(routes.edges).toHaveLength(graph.edges.length);
  });
});

describe("node fields needed for styling (id, kind, publicExposed, vulnerabilities, missing)", () => {
  it("are present on every node of /graph", async () => {
    const body = (await request(app).get("/graph")).body as GraphResponse;
    body.nodes.forEach(expectStylable);
    // Includes infra nodes that lack these fields in the source file.
    expect(body.nodes.find((n) => n.id === "prod-sqs")).toMatchObject({ kind: "sqs", publicExposed: false, vulnerabilities: [] });
  });

  it.each(["", "?filters=public", "?filters=sink", "?filters=vulnerable"])("are present on every node of /routes%s", async (query) => {
    const body = (await request(app).get(`/routes${query}`)).body as RoutesResponse;
    expect(body.nodes.length).toBeGreaterThan(0);
    body.nodes.forEach(expectStylable);
  });
});
