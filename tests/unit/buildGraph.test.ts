import { describe, expect, it } from "vitest";
import { buildGraph, GraphDataError } from "../../src/graph/buildGraph.js";
import { neighbors } from "../../src/graph/types.js";

const service = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind: "service",
  language: "java",
  path: `svc/${name}`,
  publicExposed: false,
  ...extra,
});

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

describe("buildGraph: top-level shape (level 1)", () => {
  it.each([
    ["null", null],
    ["an array", []],
    ["nodes missing", { edges: [] }],
    ["nodes not an array", { nodes: {}, edges: [] }],
    ["edges not an array", { nodes: [], edges: "a->b" }],
  ])("throws GraphDataError when the file is %s", (_label, data) => {
    expect(() => buildGraph(data)).toThrow(GraphDataError);
  });

  it("accepts an empty graph", () => {
    const { graph, warnings } = buildGraph({ nodes: [], edges: [] });
    expect(graph.nodes.size).toBe(0);
    expect(warnings).toEqual([]);
  });
});

describe("buildGraph: nodes", () => {
  it("maps fields and applies defaults for publicExposed and vulnerabilities", () => {
    const { graph, warnings } = buildGraph({
      nodes: [
        service("a", { publicExposed: true }),
        { name: "db", kind: "rds", metadata: { engine: "postgres" } },
      ],
      edges: [],
    });

    expect(warnings).toEqual([]);
    expect(graph.nodes.get("a")).toEqual({
      id: "a",
      kind: "service",
      language: "java",
      path: "svc/a",
      publicExposed: true,
      vulnerabilities: [],
      missing: false,
    });
    const db = graph.nodes.get("db");
    expect(db).toEqual({
      id: "db",
      kind: "rds",
      publicExposed: false,
      vulnerabilities: [],
      metadata: { engine: "postgres" },
      missing: false,
    });
    // Absent optional fields are not present-as-undefined.
    expect(db).not.toHaveProperty("language");
  });

  it("accepts any kind string", () => {
    const { graph } = buildGraph({ nodes: [{ name: "q", kind: "kafka" }], edges: [] });
    expect(graph.nodes.get("q")?.kind).toBe("kafka");
  });

  it("keeps vulnerabilities, including unusual ones, without dropping the node", () => {
    const vulns = [
      { file: "A.java", severity: "high", message: "SQLi", metadata: { cwe: "CWE-89" } },
      { severity: "low", extraField: 42 },
    ];
    const { graph, warnings } = buildGraph({ nodes: [service("a", { vulnerabilities: vulns })], edges: [] });

    expect(warnings).toEqual([]);
    expect(graph.nodes.get("a")?.vulnerabilities).toEqual(vulns);
  });

  it("skips a malformed node with a warning and still loads the others", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a"), { name: "bad", kind: "service", publicExposed: "yes" }, { kind: "service" }, service("b")],
      edges: [],
    });

    expect([...graph.nodes.keys()]).toEqual(["a", "b"]);
    expect(codes(warnings)).toEqual(["INVALID_NODE", "INVALID_NODE"]);
    expect(warnings[0]?.message).toContain('nodes[1] ("bad")');
    expect(warnings[0]?.message).toContain("publicExposed");
    expect(warnings[1]?.message).toContain("nodes[2]");
  });

  it("keeps the first definition of a duplicate node", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a", { publicExposed: true }), service("a", { publicExposed: false })],
      edges: [],
    });

    expect(graph.nodes.get("a")?.publicExposed).toBe(true);
    expect(codes(warnings)).toEqual(["DUPLICATE_NODE"]);
  });
});

describe("buildGraph: edges", () => {
  it("normalises a string `to` into a single edge", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a"), service("b")],
      edges: [{ from: "a", to: "b" }],
    });

    expect(neighbors(graph, "a")).toEqual(["b"]);
    expect(warnings).toEqual([]);
  });

  it("returns no neighbors for nodes without outgoing edges", () => {
    const { graph } = buildGraph({ nodes: [service("a")], edges: [] });
    expect(neighbors(graph, "a")).toEqual([]);
  });

  it("merges records with the same `from` and drops duplicate targets", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a"), service("b"), service("c")],
      edges: [
        { from: "a", to: ["b", "b"] },
        { from: "a", to: ["c", "b"] },
      ],
    });

    expect(neighbors(graph, "a")).toEqual(["b", "c"]);
    expect(codes(warnings)).toEqual(["DUPLICATE_EDGE", "DUPLICATE_EDGE"]);
    expect(warnings[0]?.message).toContain('"a->b"');
  });

  it("keeps self-loops", () => {
    const { graph, warnings } = buildGraph({ nodes: [service("a")], edges: [{ from: "a", to: ["a"] }] });
    expect(neighbors(graph, "a")).toEqual(["a"]);
    expect(warnings).toEqual([]);
  });

  it("skips a malformed edge with a warning and still loads the others", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a"), service("b")],
      edges: [{ from: "a", to: 42 }, { to: ["b"] }, { from: "b", to: [""] }, { from: "a", to: ["b"] }],
    });

    expect(neighbors(graph, "a")).toEqual(["b"]);
    expect(neighbors(graph, "b")).toEqual([]);
    expect(codes(warnings)).toEqual(["INVALID_EDGE", "INVALID_EDGE", "INVALID_EDGE"]);
    expect(warnings[0]?.message).toContain('edges[0] ("a")');
  });
});

describe("buildGraph: missing nodes", () => {
  it("adds one placeholder per undefined target, listing who references it", () => {
    const { graph, warnings } = buildGraph({
      nodes: [service("a"), service("b")],
      edges: [
        { from: "a", to: ["ghost"] },
        { from: "b", to: ["ghost"] },
      ],
    });

    expect(graph.nodes.get("ghost")).toEqual({
      id: "ghost",
      kind: "unknown",
      publicExposed: false,
      vulnerabilities: [],
      missing: true,
    });
    expect(neighbors(graph, "a")).toEqual(["ghost"]);
    expect(warnings).toEqual([
      {
        code: "MISSING_NODE",
        message:
          'Node "ghost" is referenced by edges but not defined (referenced by a, b); added placeholder with kind "unknown"',
      },
    ]);
  });

  it("adds a placeholder for an undefined `from` node", () => {
    const { graph, warnings } = buildGraph({ nodes: [service("b")], edges: [{ from: "ghost", to: ["b"] }] });

    expect(graph.nodes.get("ghost")?.missing).toBe(true);
    expect(neighbors(graph, "ghost")).toEqual(["b"]);
    expect(codes(warnings)).toEqual(["MISSING_NODE"]);
  });

  it("does not treat a node defined later in the file as missing", () => {
    const { warnings } = buildGraph({ nodes: [service("a"), service("b")], edges: [{ from: "b", to: ["a"] }] });
    expect(warnings).toEqual([]);
  });
});
