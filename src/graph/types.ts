import type { Vulnerability } from "./schema.js";

export type { Vulnerability };

/** A node of the normalised in-memory graph. `id` is the node's `name` in the file. */
export interface GraphNode {
  readonly id: string;
  readonly kind: string;
  readonly language?: string;
  readonly path?: string;
  readonly publicExposed: boolean;
  readonly vulnerabilities: readonly Vulnerability[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** True for placeholders created for nodes referenced by edges but not defined (D8). */
  readonly missing: boolean;
}

export interface Graph {
  /** Every node by id, including placeholders. Insertion order = file order. */
  readonly nodes: ReadonlyMap<string, GraphNode>;
  /**
   * Outgoing neighbors by node id, deduplicated, in file order. Nodes without
   * outgoing edges have no entry; use `neighbors()` to read safely.
   */
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
}

export type GraphWarningCode =
  | "INVALID_NODE"
  | "INVALID_EDGE"
  | "DUPLICATE_NODE"
  | "DUPLICATE_EDGE"
  | "MISSING_NODE";

export interface GraphWarning {
  readonly code: GraphWarningCode;
  readonly message: string;
}

const NO_NEIGHBORS: readonly string[] = [];

export function neighbors(graph: Graph, id: string): readonly string[] {
  return graph.adjacency.get(id) ?? NO_NEIGHBORS;
}

export function edgeCount(graph: Graph): number {
  let count = 0;
  for (const targets of graph.adjacency.values()) count += targets.length;
  return count;
}
