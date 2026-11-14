import type { Graph, GraphNode, Vulnerability } from "../graph/types.js";
import type { QueryResult } from "./queryEngine.js";

/** Response format of GET /routes (D6): a normalised graph plus routes as id lists. */
export interface RoutesResponse {
  nodes: NodeDto[];
  edges: EdgeDto[];
  routes: RouteDto[];
  meta: {
    filters: string[];
    match: QueryResult["match"];
    /** Number of routes in this response. */
    routeCount: number;
    /** True if more matching routes exist than were returned (limit reached). */
    truncated: boolean;
  };
}

/** Response format of GET /graph (D11): the whole graph, same node/edge format as /routes. */
export interface GraphResponse {
  nodes: NodeDto[];
  edges: EdgeDto[];
  meta: { nodeCount: number; edgeCount: number };
}

/**
 * The fields a UI needs to style a node are always present (never omitted):
 * id, kind, publicExposed, vulnerabilities, missing. The rest are optional.
 */
export interface NodeDto {
  id: string;
  kind: string;
  language?: string;
  path?: string;
  publicExposed: boolean;
  vulnerabilities: readonly Vulnerability[];
  metadata?: Readonly<Record<string, unknown>>;
  missing: boolean;
}

export interface EdgeDto {
  /** `from->to`; unique because graph building merges duplicate edges (D8). */
  id: string;
  from: string;
  to: string;
}

export interface RouteDto {
  /** `r0`, `r1`, …: stable within one response only. */
  id: string;
  nodes: string[];
  edges: string[];
}

export const edgeId = (from: string, to: string): string => `${from}->${to}`;

/**
 * Builds the client-ready response. `nodes` and `edges` contain only what the
 * matching routes use, each once, in order of first appearance.
 */
export function toRoutesResponse(graph: Graph, result: QueryResult): RoutesResponse {
  const nodes = new Map<string, NodeDto>();
  const edges = new Map<string, EdgeDto>();

  const routes = result.routes.map((route, index): RouteDto => {
    const routeEdges: string[] = [];
    route.forEach((id, i) => {
      if (!nodes.has(id)) nodes.set(id, toNodeDto(graph.nodes.get(id) ?? unknownNode(id)));
      if (i === 0) return;
      const from = route[i - 1]!;
      const eid = edgeId(from, id);
      if (!edges.has(eid)) edges.set(eid, { id: eid, from, to: id });
      routeEdges.push(eid);
    });
    return { id: `r${index}`, nodes: [...route], edges: routeEdges };
  });

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    routes,
    meta: {
      filters: result.filters,
      match: result.match,
      routeCount: routes.length,
      truncated: result.truncated,
    },
  };
}

/**
 * Every node (including isolated ones and placeholders) and every edge, in graph
 * order. Ids match GET /routes, so a client can draw this once and highlight
 * routes on top of it.
 */
export function toGraphResponse(graph: Graph): GraphResponse {
  const nodes = [...graph.nodes.values()].map(toNodeDto);
  const edges: EdgeDto[] = [];
  for (const [from, targets] of graph.adjacency) {
    for (const to of targets) edges.push({ id: edgeId(from, to), from, to });
  }
  return { nodes, edges, meta: { nodeCount: nodes.length, edgeCount: edges.length } };
}

function toNodeDto(node: GraphNode): NodeDto {
  return {
    id: node.id,
    kind: node.kind,
    ...(node.language !== undefined && { language: node.language }),
    ...(node.path !== undefined && { path: node.path }),
    publicExposed: node.publicExposed,
    vulnerabilities: node.vulnerabilities,
    ...(node.metadata !== undefined && { metadata: node.metadata }),
    missing: node.missing,
  };
}

/** Defensive: buildGraph always creates placeholders, but hand-built graphs may not. */
function unknownNode(id: string): GraphNode {
  return { id, kind: "unknown", publicExposed: false, vulnerabilities: [], missing: true };
}
