import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import type { RoutesResponse } from "../../src/engine/toResponse.js";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { loadGraph } from "../../src/graph/loadGraph.js";

const silent = { info: () => {}, warn: () => {} };

/** Every id a route references must exist in the top-level nodes/edges (D6). */
function expectConsistent(body: RoutesResponse): void {
  const nodeIds = new Set(body.nodes.map((n) => n.id));
  const edgeIds = new Set(body.edges.map((e) => e.id));
  expect(nodeIds.size).toBe(body.nodes.length);
  expect(edgeIds.size).toBe(body.edges.length);
  for (const route of body.routes) {
    expect(route.nodes.length).toBeGreaterThanOrEqual(2);
    expect(route.edges).toEqual(route.nodes.slice(1).map((to, i) => `${route.nodes[i]}->${to}`));
    for (const id of route.nodes) expect(nodeIds).toContain(id);
    for (const id of route.edges) expect(edgeIds).toContain(id);
  }
  expect(body.meta.routeCount).toBe(body.routes.length);
}

describe("GET /routes on the provided data", () => {
  let app: Express;
  beforeAll(async () => {
    app = createApp({ graph: await loadGraph(config.dataPath, silent), registry: createDefaultRegistry() });
  });

  const get = async (query: string) => {
    const res = await request(app).get(`/routes${query}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const body = res.body as RoutesResponse;
    expectConsistent(body);
    return body;
  };

  it("returns every route without filters", async () => {
    const body = await get("");
    expect(body.meta).toEqual({ filters: [], match: "all", routeCount: 299, truncated: false });
    expect(body.nodes).toHaveLength(42); // 47 nodes minus 5 isolated ones
    expect(body.edges).toHaveLength(98);
  });

  describe("each filter alone", () => {
    it("public: 5 routes, all from frontend", async () => {
      const body = await get("?filters=public");
      expect(body.meta.routeCount).toBe(5);
      expect(new Set(body.routes.map((r) => r.nodes[0]))).toEqual(new Set(["frontend"]));
      expect(body.nodes.find((n) => n.id === "frontend")?.publicExposed).toBe(true);
    });

    it("sink: 41 routes, all ending in prod-postgresdb", async () => {
      const body = await get("?filters=sink");
      expect(body.meta.routeCount).toBe(41);
      expect(new Set(body.routes.map((r) => r.nodes.at(-1)))).toEqual(new Set(["prod-postgresdb"]));
      expect(body.nodes.find((n) => n.id === "prod-postgresdb")).toMatchObject({ kind: "rds", metadata: { engine: "postgres" } });
    });

    it("vulnerable: 82 routes, each through auth-service or order-service", async () => {
      const body = await get("?filters=vulnerable");
      expect(body.meta.routeCount).toBe(82);
      for (const route of body.routes) {
        expect(route.nodes.some((id) => id === "auth-service" || id === "order-service")).toBe(true);
      }
      expect(body.nodes.find((n) => n.id === "order-service")?.vulnerabilities).toHaveLength(2);
    });
  });

  describe("combined filters", () => {
    it("sink AND vulnerable: 41 routes (every sink route crosses a vulnerable node)", async () => {
      const body = await get("?filters=sink,vulnerable");
      expect(body.meta).toMatchObject({ filters: ["sink", "vulnerable"], match: "all", routeCount: 41 });
      expect(body.routes.map((r) => r.nodes)).toContainEqual([
        "admin-user-service",
        "user-service",
        "auth-service",
        "prod-postgresdb",
      ]);
    });

    it("sink OR vulnerable: 82 routes", async () => {
      const body = await get("?filters=sink,vulnerable&match=any");
      expect(body.meta).toMatchObject({ match: "any", routeCount: 82 });
    });

    it("public OR sink: 46 routes", async () => {
      expect((await get("?filters=public,sink&match=any")).meta.routeCount).toBe(46);
    });

    it("public AND sink: empty result, as expected for this data", async () => {
      const body = await get("?filters=public,sink");
      expect(body).toEqual({
        nodes: [],
        edges: [],
        routes: [],
        meta: { filters: ["public", "sink"], match: "all", routeCount: 0, truncated: false },
      });
    });

    it("accepts repeated filters params and ignores duplicates and blanks", async () => {
      const body = await get("?filters=sink&filters=vulnerable,,sink");
      expect(body.meta).toMatchObject({ filters: ["sink", "vulnerable"], routeCount: 41 });
    });
  });

  describe("limit", () => {
    it("caps the result and sets truncated", async () => {
      const body = await get("?filters=sink&limit=10");
      expect(body.meta).toMatchObject({ routeCount: 10, truncated: true });
      expect(body.routes.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
    });

    it("is not truncated when every match fits", async () => {
      expect((await get("?filters=sink&limit=41")).meta).toMatchObject({ routeCount: 41, truncated: false });
    });
  });

  describe("errors", () => {
    it("rejects an unknown filter with 400 UNKNOWN_FILTER listing available filters", async () => {
      const res = await request(app).get("/routes?filters=public,nope,also-nope");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: "UNKNOWN_FILTER",
          message: "Unknown filter(s): nope, also-nope. Available filters: public, sink, vulnerable",
        },
      });
    });

    it.each([
      ["match=either", "match"],
      ["limit=0", "at least 1"],
      ["limit=10001", "at most 10000"],
      ["limit=abc", "integer"],
      ["filter=public", 'Unrecognized key: "filter"'],
    ])("rejects ?%s with 400 INVALID_QUERY", async (query, message) => {
      const res = await request(app).get(`/routes?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_QUERY");
      expect(res.body.error.message).toContain(message);
    });

    it("only serves GET", async () => {
      expect((await request(app).post("/routes")).status).toBe(404);
    });
  });
});
