import type { RouteFilter } from "./types.js";

export interface SinkFilterOptions {
  /** Node kinds that count as sinks, e.g. ["rds", "sql"]. Comes from config. */
  kinds: readonly string[];
}

/**
 * Routes whose last node is a sink. "Ends in" means the route terminates there,
 * not merely passes through (D1). No start-node pruning: any node may lead to a sink.
 */
export function createSinkFilter({ kinds }: SinkFilterOptions): RouteFilter {
  if (kinds.length === 0) throw new Error("Sink filter needs at least one sink kind");
  const sinkKinds = new Set(kinds);

  return {
    name: "sink",
    description: `Route ends in a sink (kinds: ${[...sinkKinds].join(", ")})`,
    matches(route, graph) {
      const last = route.at(-1);
      const kind = last === undefined ? undefined : graph.nodes.get(last)?.kind;
      return kind !== undefined && sinkKinds.has(kind);
    },
  };
}
