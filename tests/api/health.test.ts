import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/createApp.js";
import { errorHandler, HttpError } from "../../src/api/errors.js";
import { createRegistry } from "../../src/filters/registry.js";
import { makeGraph } from "../fixtures/graphs.js";

const app = () => createApp({ graph: makeGraph({}), registry: createRegistry([]) });

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("error handling", () => {
  it("returns 404 in the standard error shape for unknown paths", async () => {
    const res = await request(app()).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "No route for GET /does-not-exist" },
    });
  });

  it("returns HttpError status and code as-is", async () => {
    const app = express();
    app.get("/boom", () => {
      throw new HttpError(400, "BAD_THING", "Something was bad");
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "BAD_THING", message: "Something was bad" } });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const app = express();
    app.get("/boom", async () => {
      throw new Error("secret internal detail");
    });
    app.use(errorHandler);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
