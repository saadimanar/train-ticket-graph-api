import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/createApp.js";
import { createRegistry } from "../../src/filters/registry.js";
import { makeGraph } from "../fixtures/graphs.js";

const appWith = (allowedOrigins?: string[]) =>
  createApp({
    graph: makeGraph({}),
    registry: createRegistry([]),
    ...(allowedOrigins && { allowedOrigins }),
  });

describe("CORS", () => {
  const app = appWith(["http://localhost:5173", "https://app.example.com"]);

  it.each(["http://localhost:5173", "https://app.example.com"])("allows %s", async (origin) => {
    const res = await request(app).get("/health").set("Origin", origin);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["vary"]).toMatch(/Origin/);
  });

  it("sends no CORS header to other origins, so the browser blocks the response", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not match origins loosely (scheme, port and subdomain must be exact)", async () => {
    for (const origin of ["http://app.example.com", "https://app.example.com:8443", "https://x.app.example.com"]) {
      const res = await request(app).get("/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"], origin).toBeUndefined();
    }
  });

  it("answers preflight requests for GET", async () => {
    const res = await request(app)
      .options("/routes")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-methods"]).toBe("GET");
  });

  it("applies CORS headers to error responses too, so the client can read them", async () => {
    const res = await request(app).get("/nope").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(404);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("allows no cross-origin access by default", async () => {
    const res = await request(appWith()).get("/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
