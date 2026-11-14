import type { Graph, GraphNode, Route } from "../graph/types.js";

/**
 * A named yes/no test on a single route (D4).
 *
 * To add a filter: create a file in this folder exporting a RouteFilter (or a
 * factory for a configurable one) and add it to the list in `index.ts`. The engine
 * and the API only talk to the registry, so nothing else changes.
 */
export interface RouteFilter {
  /** Used in `?filters=…`. Lowercase letters, digits and dashes. */
  readonly name: string;
  /** Human-readable explanation, returned by `GET /filters`. */
  readonly description: string;
  /** Source of truth: does this route pass the filter? */
  matches(route: Route, graph: Graph): boolean;
  /**
   * Optional pruning hook (D5): can a route starting at `node` possibly match?
   * Pure optimisation: `matches` still runs on every route, so returning `true`
   * too often only costs time. It must never return `false` for a node whose
   * routes could match.
   */
  canStartAt?(node: GraphNode, graph: Graph): boolean;
}
