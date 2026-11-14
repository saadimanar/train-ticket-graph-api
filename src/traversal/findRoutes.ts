import { neighbors, type Graph, type Route } from "../graph/types.js";

export interface FindRoutesOptions {
  /**
   * Nodes to start from, in this order (duplicates ignored). Defaults to every
   * node in the graph. The query engine narrows this for pruning (D5).
   */
  startNodes?: Iterable<string>;
}

/**
 * Lazily enumerates every route in the graph (D1, D2):
 * - a route starts at any start node and is extended depth-first until it reaches
 *   a node with no neighbor that is not already on the route;
 * - only simple paths are produced, so cycles terminate the route instead of
 *   looping forever;
 * - single-node routes are never produced.
 *
 * Being a generator, callers can stop early (e.g. at a limit) without the rest
 * being computed. Order is deterministic: start nodes in order, then neighbors in
 * adjacency order.
 */
export function* findRoutes(graph: Graph, options: FindRoutesOptions = {}): Generator<Route, void, undefined> {
  const starts = new Set(options.startNodes ?? graph.nodes.keys());
  for (const start of starts) {
    yield* findRoutesFrom(graph, start);
  }
}

/** All routes starting at `start`. Yields nothing if `start` has no outgoing edges. */
export function* findRoutesFrom(graph: Graph, start: string): Generator<Route, void, undefined> {
  yield* walk(graph, [start], new Set([start]));
}

/**
 * `path` and `onPath` are mutated during the walk and restored on backtrack, so
 * each yielded route is a frozen copy.
 */
function* walk(graph: Graph, path: string[], onPath: Set<string>): Generator<Route, void, undefined> {
  const current = path[path.length - 1]!;
  let extended = false;

  for (const next of neighbors(graph, current)) {
    if (onPath.has(next)) continue; // would close a cycle
    extended = true;
    path.push(next);
    onPath.add(next);
    yield* walk(graph, path, onPath);
    path.pop();
    onPath.delete(next);
  }

  if (!extended && path.length >= 2) {
    yield Object.freeze([...path]);
  }
}
