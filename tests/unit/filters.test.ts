import { describe, expect, it } from "vitest";
import { publicStartFilter } from "../../src/filters/publicStart.js";
import { createSinkFilter } from "../../src/filters/sinkEnd.js";
import { vulnerableFilter } from "../../src/filters/vulnerable.js";
import { makeGraph } from "../fixtures/graphs.js";

const vuln = [{ severity: "high", message: "SQLi" }];

describe("public filter", () => {
  const graph = makeGraph(
    { web: ["api"], api: ["db"], internal: ["web"] },
    { nodes: { web: { publicExposed: true }, db: { kind: "rds" } } },
  );

  it("matches routes whose first node is public", () => {
    expect(publicStartFilter.matches(["web", "api", "db"], graph)).toBe(true);
  });

  it("does not match when the public node is not the first", () => {
    expect(publicStartFilter.matches(["internal", "web", "api"], graph)).toBe(false);
  });

  it("does not match when the first node is not in the graph", () => {
    expect(publicStartFilter.matches(["ghost", "api"], graph)).toBe(false);
  });

  it("prunes starts to public nodes only", () => {
    expect(publicStartFilter.canStartAt?.(graph.nodes.get("web")!, graph)).toBe(true);
    expect(publicStartFilter.canStartAt?.(graph.nodes.get("api")!, graph)).toBe(false);
  });
});

describe("sink filter", () => {
  const graph = makeGraph(
    { a: ["db", "legacy", "queue", "ghost"], db: ["b"] },
    { nodes: { db: { kind: "rds" }, legacy: { kind: "sql" }, queue: { kind: "sqs" } }, omit: ["ghost"] },
  );
  const sink = createSinkFilter({ kinds: ["rds", "sql"] });

  it.each([
    [["a", "legacy"], true],
    [["db", "b"], false], // passes through a sink but doesn't end there
    [["a", "queue"], false],
    [["a", "ghost"], false], // node missing from the map
  ])("%j → %s", (route, expected) => {
    expect(sink.matches(route, graph)).toBe(expected);
  });

  it("matches a route ending in any configured kind", () => {
    expect(sink.matches(["a", "db"], graph)).toBe(true);
  });

  it("uses the configured kinds, not hard-coded ones", () => {
    const queueSink = createSinkFilter({ kinds: ["sqs"] });
    expect(queueSink.matches(["a", "queue"], graph)).toBe(true);
    expect(queueSink.matches(["a", "legacy"], graph)).toBe(false);
    expect(queueSink.description).toBe("Route ends in a sink (kinds: sqs)");
  });

  it("rejects an empty kind list", () => {
    expect(() => createSinkFilter({ kinds: [] })).toThrow(/at least one/);
  });

  it("has no pruning hook", () => {
    expect(sink.canStartAt).toBeUndefined();
  });
});

describe("vulnerable filter", () => {
  const graph = makeGraph(
    { a: ["b"], b: ["c"], x: ["y", "ghost"] },
    { nodes: { a: { vulnerabilities: vuln }, b: { vulnerabilities: vuln }, c: { vulnerabilities: vuln } }, omit: ["ghost"] },
  );
  const only = (id: string) =>
    makeGraph({ p: ["q"], q: ["r"] }, { nodes: { [id]: { vulnerabilities: vuln } } });

  it.each(["p", "q", "r"])("matches when the vulnerable node is %s (first/middle/last)", (id) => {
    expect(vulnerableFilter.matches(["p", "q", "r"], only(id))).toBe(true);
  });

  it("does not match when no node has vulnerabilities", () => {
    expect(vulnerableFilter.matches(["x", "y"], graph)).toBe(false);
  });

  it("treats a node missing from the map as not vulnerable", () => {
    expect(vulnerableFilter.matches(["x", "ghost"], graph)).toBe(false);
  });

  it("has no pruning hook", () => {
    expect(vulnerableFilter.canStartAt).toBeUndefined();
  });
});
