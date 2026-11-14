import type { z } from "zod";
import { GraphFileSchema, RawEdgeSchema, RawNodeSchema, type RawNode } from "./schema.js";
import type { Graph, GraphNode, GraphWarning } from "./types.js";

/** The file as a whole is unusable (D8): startup should fail. */
export class GraphDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphDataError";
  }
}

export interface BuildGraphResult {
  graph: Graph;
  warnings: GraphWarning[];
}

/**
 * Turns parsed JSON into the normalised in-memory graph. Pure: no I/O, no logging;
 * recoverable problems are returned as warnings (D8).
 *
 * @throws GraphDataError if the top-level shape is invalid.
 */
export function buildGraph(data: unknown): BuildGraphResult {
  // Level 1: strict top-level shape; entries stay `unknown`.
  const file = GraphFileSchema.safeParse(data);
  if (!file.success) {
    throw new GraphDataError(`Invalid graph file: ${formatIssues(file.error)}`);
  }

  const warnings: GraphWarning[] = [];
  const nodes = new Map<string, GraphNode>();
  const adjacency = new Map<string, string[]>();

  // Level 2: each node on its own; bad entries are skipped.
  file.data.nodes.forEach((entry, index) => {
    const parsed = RawNodeSchema.safeParse(entry);
    if (!parsed.success) {
      warnings.push({
        code: "INVALID_NODE",
        message: `Skipped ${describeEntry("nodes", index, entry, "name")}: ${formatIssues(parsed.error)}`,
      });
      return;
    }
    const node = toGraphNode(parsed.data);
    if (nodes.has(node.id)) {
      warnings.push({
        code: "DUPLICATE_NODE",
        message: `Skipped nodes[${index}]: duplicate node "${node.id}" (first definition kept)`,
      });
      return;
    }
    nodes.set(node.id, node);
  });

  // Level 2: each edge record on its own. Records with the same `from` are merged
  // and duplicate targets dropped, which makes `from->to` a unique edge id (D6).
  const missingRefs = new Map<string, Set<string>>();
  const noteIfMissing = (id: string, referencedBy: string): void => {
    if (nodes.has(id)) return;
    let refs = missingRefs.get(id);
    if (!refs) missingRefs.set(id, (refs = new Set()));
    refs.add(referencedBy);
  };

  file.data.edges.forEach((entry, index) => {
    const parsed = RawEdgeSchema.safeParse(entry);
    if (!parsed.success) {
      warnings.push({
        code: "INVALID_EDGE",
        message: `Skipped ${describeEntry("edges", index, entry, "from")}: ${formatIssues(parsed.error)}`,
      });
      return;
    }
    const { from, to } = parsed.data;
    noteIfMissing(from, from);

    let targets = adjacency.get(from);
    if (!targets) adjacency.set(from, (targets = []));
    for (const target of to) {
      if (targets.includes(target)) {
        warnings.push({
          code: "DUPLICATE_EDGE",
          message: `Dropped duplicate edge "${from}->${target}" (edges[${index}])`,
        });
        continue;
      }
      targets.push(target);
      noteIfMissing(target, from);
    }
  });

  // Placeholders for referenced-but-undefined nodes, one warning each (D8).
  for (const [id, refs] of missingRefs) {
    nodes.set(id, placeholderNode(id));
    const by = [...refs].filter((ref) => ref !== id);
    warnings.push({
      code: "MISSING_NODE",
      message:
        `Node "${id}" is referenced by edges but not defined` +
        (by.length > 0 ? ` (referenced by ${by.join(", ")})` : "") +
        `; added placeholder with kind "unknown"`,
    });
  }

  return { graph: { nodes, adjacency }, warnings };
}

function toGraphNode(raw: RawNode): GraphNode {
  // Conditional spreads: with exactOptionalPropertyTypes, optional fields must be
  // absent rather than present-and-undefined.
  return {
    id: raw.name,
    kind: raw.kind,
    ...(raw.language !== undefined && { language: raw.language }),
    ...(raw.path !== undefined && { path: raw.path }),
    publicExposed: raw.publicExposed,
    vulnerabilities: raw.vulnerabilities,
    ...(raw.metadata !== undefined && { metadata: raw.metadata }),
    missing: false,
  };
}

function placeholderNode(id: string): GraphNode {
  return { id, kind: "unknown", publicExposed: false, vulnerabilities: [], missing: true };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

/** e.g. `nodes[3] ("auth-service")`, falling back to `nodes[3]` when there's no usable name. */
function describeEntry(collection: string, index: number, entry: unknown, key: string): string {
  const label =
    typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>)[key] === "string"
      ? ` ("${(entry as Record<string, string>)[key]}")`
      : "";
  return `${collection}[${index}]${label}`;
}
