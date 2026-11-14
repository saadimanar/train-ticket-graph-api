import type { RouteFilter } from "./types.js";

/** Routes where at least one node has a vulnerability. No start-node pruning possible. */
export const vulnerableFilter: RouteFilter = {
  name: "vulnerable",
  description: "At least one node on the route has a vulnerability",
  matches(route, graph) {
    return route.some((id) => (graph.nodes.get(id)?.vulnerabilities.length ?? 0) > 0);
  },
};
