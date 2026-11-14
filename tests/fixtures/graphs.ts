import type { Graph, GraphNode } from "../../src/graph/types.js";

/**
 * Builds a Graph directly (bypassing buildGraph) so traversal and filter tests
 * don't depend on file parsing. Every id that appears in `edges` becomes a plain
 * service node unless listed in `omit` (to simulate a node missing from the map)
 * or overridden in `nodes`.
 */
export function makeGraph(
  edges: Record<string, string[]>,
  options: { nodes?: Record<string, Partial<GraphNode>>; omit?: string[]; isolated?: string[] } = {},
): Graph {
  const ids = new Set<string>([
    ...Object.keys(edges),
    ...Object.values(edges).flat(),
    ...Object.keys(options.nodes ?? {}),
    ...(options.isolated ?? []),
  ]);
  for (const id of options.omit ?? []) ids.delete(id);

  const nodes = new Map<string, GraphNode>();
  for (const id of ids) {
    nodes.set(id, {
      id,
      kind: "service",
      publicExposed: false,
      vulnerabilities: [],
      missing: false,
      ...options.nodes?.[id],
    });
  }
  const adjacency = new Map(Object.entries(edges).filter(([, targets]) => targets.length > 0));
  return { nodes, adjacency };
}

/** a → b → c */
export const linear = () => makeGraph({ a: ["b"], b: ["c"] });

/** a → {b, c} → d */
export const diamond = () => makeGraph({ a: ["b", "c"], b: ["d"], c: ["d"] });

/** The D2 example: A ⇄ B, A → C */
export const twoCycle = () => makeGraph({ A: ["B", "C"], B: ["A"] });

/** a → b → c → a */
export const triangle = () => makeGraph({ a: ["b"], b: ["c"], c: ["a"] });

/** a → a (self-loop), a → b */
export const selfLoop = () => makeGraph({ a: ["a", "b"] });

/** Every node points to every other node: n! Hamiltonian routes. */
export function complete(n: number): Graph {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  return makeGraph(Object.fromEntries(ids.map((id) => [id, ids.filter((other) => other !== id)])));
}

/** a → ghost, where ghost is referenced but has no entry in the node map. */
export const missingTarget = () => makeGraph({ a: ["ghost", "b"] }, { omit: ["ghost"] });

/**
 * `layers` layers of two nodes, each fully connected to the next:
 * 2^layers routes from s, so enumerating all of them is infeasible for large layers.
 */
export function ladder(layers: number): Graph {
  const edges: Record<string, string[]> = { s: ["l0a", "l0b"] };
  for (let i = 0; i < layers - 1; i++) {
    edges[`l${i}a`] = [`l${i + 1}a`, `l${i + 1}b`];
    edges[`l${i}b`] = [`l${i + 1}a`, `l${i + 1}b`];
  }
  return makeGraph(edges);
}
