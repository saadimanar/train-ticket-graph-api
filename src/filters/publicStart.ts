import type { RouteFilter } from "./types.js";

/** Routes that start in a publicly exposed service. */
export const publicStartFilter: RouteFilter = {
  name: "public",
  description: "Route starts in a publicly exposed service",
  matches(route, graph) {
    const first = route[0];
    return first !== undefined && graph.nodes.get(first)?.publicExposed === true;
  },
  // Only public nodes can start a matching route, so the engine starts only there.
  canStartAt: (node) => node.publicExposed,
};
