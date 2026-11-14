import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { GraphDataError } from "../../src/graph/buildGraph.js";
import { loadBundledGraph, loadGraph, type Logger } from "../../src/graph/loadGraph.js";
import { edgeCount, neighbors } from "../../src/graph/types.js";

const dataFile = fileURLToPath(new URL("../../data/train-ticket-graph.json", import.meta.url));

function recordingLogger(): Logger & { infos: string[]; warns: string[] } {
  const infos: string[] = [];
  const warns: string[] = [];
  return { infos, warns, info: (m) => infos.push(m), warn: (m) => warns.push(m) };
}

describe("loadGraph with the provided data file", () => {
  it("loads all nodes, edges and quirks as decided in D8", async () => {
    const logger = recordingLogger();
    const graph = await loadGraph(dataFile, logger);

    // 46 defined nodes + 1 placeholder for assurance-service.
    expect(graph.nodes.size).toBe(47);
    expect(edgeCount(graph)).toBe(98);

    expect(graph.nodes.get("assurance-service")).toMatchObject({ kind: "unknown", missing: true });
    // The string `to` was normalised.
    expect(neighbors(graph, "consign-service")).toEqual(["consign-price-service"]);
    // Infra nodes get defaults.
    expect(graph.nodes.get("prod-postgresdb")).toMatchObject({ kind: "rds", publicExposed: false, vulnerabilities: [] });
    expect(graph.nodes.get("order-service")?.vulnerabilities).toHaveLength(2);

    expect(logger.warns).toHaveLength(1);
    expect(logger.warns[0]).toContain("MISSING_NODE");
    expect(logger.warns[0]).toContain("assurance-service");
    expect(logger.infos[0]).toContain("Loaded 47 nodes and 98 edges");
  });
});

describe("loadBundledGraph", () => {
  it("loads the same graph as reading the file from disk", async () => {
    const logger = recordingLogger();
    const bundled = loadBundledGraph(logger);
    const fromDisk = await loadGraph(dataFile, recordingLogger());

    expect([...bundled.nodes.entries()]).toEqual([...fromDisk.nodes.entries()]);
    expect([...bundled.adjacency.entries()]).toEqual([...fromDisk.adjacency.entries()]);
    expect(logger.warns).toHaveLength(1);
    expect(logger.infos[0]).toContain("from bundled data/train-ticket-graph.json");
  });
});

describe("loadGraph failures", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "graph-test-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("throws GraphDataError for a missing file", async () => {
    await expect(loadGraph(path.join(dir, "nope.json"), recordingLogger())).rejects.toThrow(GraphDataError);
  });

  it("throws GraphDataError for invalid JSON", async () => {
    const file = path.join(dir, "broken.json");
    await writeFile(file, "{ not json");
    await expect(loadGraph(file, recordingLogger())).rejects.toThrow(/not valid JSON/);
  });

  it("throws GraphDataError for an invalid top-level shape", async () => {
    const file = path.join(dir, "shape.json");
    await writeFile(file, JSON.stringify({ nodes: "x", edges: [] }));
    await expect(loadGraph(file, recordingLogger())).rejects.toThrow(/Invalid graph file: nodes/);
  });
});
