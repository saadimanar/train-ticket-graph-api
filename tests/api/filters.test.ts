import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { makeGraph } from "../fixtures/graphs.js";

describe("GET /filters", () => {
  it("lists the registered filters with descriptions", async () => {
    const app = createApp({ graph: makeGraph({}), registry: createDefaultRegistry({ sinkKinds: ["rds", "sql"] }) });
    const res = await request(app).get("/filters");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      filters: [
        { name: "public", description: "Route starts in a publicly exposed service" },
        { name: "sink", description: "Route ends in a sink (kinds: rds, sql)" },
        { name: "vulnerable", description: "At least one node on the route has a vulnerability" },
      ],
    });
  });
});
