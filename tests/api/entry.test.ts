import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("src/index.ts as a Vercel function (VERCEL=1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("default-exports a ready app, loads the graph on import, and does not listen", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.example.com");
    vi.resetModules();
    const listen = vi.spyOn(express.application, "listen");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { default: app } = await import("../../src/index.js");

    expect(listen).not.toHaveBeenCalled();
    // The graph was loaded once, at import time.
    expect(info.mock.calls.filter(([msg]) => String(msg).includes("[graph] Loaded"))).toHaveLength(1);

    const res = await request(app).get("/graph").set("Origin", "https://app.example.com");
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ nodeCount: 47, edgeCount: 98 });
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");

    // Further requests reuse the loaded graph.
    await request(app).get("/routes?filters=sink");
    expect(info.mock.calls.filter(([msg]) => String(msg).includes("[graph] Loaded"))).toHaveLength(1);
  });
});
