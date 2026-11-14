import type { Graph, Route } from "../graph/types.js";
import type { FilterRegistry } from "../filters/registry.js";
import type { RouteFilter } from "../filters/types.js";
import { findRoutes } from "../traversal/findRoutes.js";

export type MatchMode = "all" | "any";

export interface RouteQuery {
  /** Filter names; unknown names throw UnknownFilterError. Duplicates are ignored. */
  filters?: readonly string[];
  /** How filters combine (D3). Default "all". */
  match?: MatchMode;
  /** Maximum routes to return. Omitted = no limit (the API always sets one, D6). */
  limit?: number;
}

export interface QueryResult {
  /** Resolved filter names, deduplicated, in request order. */
  filters: string[];
  match: MatchMode;
  routes: Route[];
  /** True if more matching routes exist beyond `limit`. */
  truncated: boolean;
}

export interface QueryEngine {
  query(query?: RouteQuery): QueryResult;
}

/**
 * Generic over filters: it only knows the RouteFilter interface and the registry,
 * so adding a filter never changes this file.
 */
export function createQueryEngine(graph: Graph, registry: FilterRegistry): QueryEngine {
  return {
    query({ filters: names = [], match = "all", limit = Number.POSITIVE_INFINITY } = {}) {
      const filters = registry.resolve(names);
      const startNodes = selectStartNodes(graph, filters, match);
      const accepts = combine(filters, match);

      const routes: Route[] = [];
      let truncated = false;
      for (const route of findRoutes(graph, startNodes ? { startNodes } : {})) {
        if (!accepts(route, graph)) continue;
        if (routes.length >= limit) {
          // One more match exists beyond the limit; stop without computing the rest.
          truncated = true;
          break;
        }
        routes.push(route);
      }

      return { filters: filters.map((f) => f.name), match, routes, truncated };
    },
  };
}

type RoutePredicate = (route: Route, graph: Graph) => boolean;

function combine(filters: readonly RouteFilter[], match: MatchMode): RoutePredicate {
  // No filters → every route, regardless of match mode (D3).
  if (filters.length === 0) return () => true;
  return match === "all"
    ? (route, graph) => filters.every((f) => f.matches(route, graph))
    : (route, graph) => filters.some((f) => f.matches(route, graph));
}

/**
 * Start-node pruning (D5). Returns undefined when no pruning is possible, meaning
 * "start everywhere".
 * - all: a start must pass every filter that has the hook (others don't restrict).
 * - any: only if every filter has the hook; a start must pass at least one.
 */
export function selectStartNodes(
  graph: Graph,
  filters: readonly RouteFilter[],
  match: MatchMode,
): string[] | undefined {
  const hooks = filters.flatMap((f) => (f.canStartAt ? [f.canStartAt.bind(f)] : []));
  if (hooks.length === 0) return undefined;
  if (match === "any" && hooks.length < filters.length) return undefined;

  const starts: string[] = [];
  for (const node of graph.nodes.values()) {
    const ok = match === "all" ? hooks.every((h) => h(node, graph)) : hooks.some((h) => h(node, graph));
    if (ok) starts.push(node.id);
  }
  return starts;
}
