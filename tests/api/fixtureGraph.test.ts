import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/createApp.js";
import type { RoutesResponse } from "../../src/engine/toResponse.js";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { createRegistry } from "../../src/filters/registry.js";
import { publicStartFilter } from "../../src/filters/publicStart.js";
import type { RouteFilter } from "../../src/filters/types.js";
import { buildGraph } from "../../src/graph/buildGraph.js";

/**
 * A small graph run through the real loader, with a cycle and a missing node:
 *   web(public) → api ⇄ worker, api → db(rds), worker → ghost (undefined)
 */
const { graph } = buildGraph({
  nodes: [
    { name: "web", kind: "service", publicExposed: true },
    { name: "api", kind: "service", vulnerabilities: [{ severity: "high", message: "SQLi" }] },
    { name: "worker", kind: "service" },
    { name: "db", kind: "rds" },
  ],
  edges: [
    { from: "web", to: "api" },
    { from: "api", to: ["worker", "db"] },
    { from: "worker", to: ["api", "ghost"] },
  ],
});

const routesOf = (body: RoutesResponse) => body.routes.map((r) => r.nodes.join(">"));

describe("API on a fixture graph with a cycle and a missing node", () => {
  const app = createApp({ graph, registry: createDefaultRegistry() });

  it("terminates on the cycle and routes through the placeholder", async () => {
    const res = await request(app).get("/routes");
    expect(res.status).toBe(200);
    expect(routesOf(res.body)).toEqual([
      "web>api>worker>ghost",
      "web>api>db",
      "api>worker>ghost",
      "api>db",
      "worker>api>db",
      "worker>ghost",
    ]);
    expect(res.body.nodes.find((n: { id: string }) => n.id === "ghost")).toEqual({
      id: "ghost",
      kind: "unknown",
      publicExposed: false,
      vulnerabilities: [],
      missing: true,
    });
  });

  it("applies filters across the cycle", async () => {
    const res = await request(app).get("/routes?filters=public,sink");
    expect(routesOf(res.body)).toEqual(["web>api>db"]);
  });
});

describe("adding a new filter needs no API changes", () => {
  const crossesQueue: RouteFilter = {
    name: "crosses-queue",
    description: "Route passes through a message queue",
    matches: (route, g) => route.some((id) => g.nodes.get(id)?.kind === "sqs"),
  };
  const { graph: queueGraph } = buildGraph({
    nodes: [
      { name: "a", kind: "service", publicExposed: true },
      { name: "q", kind: "sqs" },
      { name: "b", kind: "service" },
    ],
    edges: [{ from: "a", to: ["q", "b"] }],
  });
  const app = createApp({ graph: queueGraph, registry: createRegistry([publicStartFilter, crossesQueue]) });

  it("lists it in GET /filters", async () => {
    const res = await request(app).get("/filters");
    expect(res.body.filters.map((f: { name: string }) => f.name)).toEqual(["public", "crosses-queue"]);
  });

  it("accepts it in GET /routes", async () => {
    const res = await request(app).get("/routes?filters=public,crosses-queue");
    expect(res.status).toBe(200);
    expect(routesOf(res.body)).toEqual(["a>q"]);
  });
});

describe("a filter that throws", () => {
  it("returns a generic 500 without leaking the error", async () => {
    const broken: RouteFilter = {
      name: "broken",
      description: "Always throws",
      matches: () => {
        throw new Error("internal detail");
      },
    };
    const app = createApp({ graph, registry: createRegistry([broken]) });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get("/routes?filters=broken");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
