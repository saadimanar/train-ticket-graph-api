import { config } from "../config.js";
import { publicStartFilter } from "./publicStart.js";
import { createRegistry, type FilterRegistry } from "./registry.js";
import { createSinkFilter } from "./sinkEnd.js";
import { vulnerableFilter } from "./vulnerable.js";

export interface DefaultRegistryOptions {
  sinkKinds?: readonly string[];
}

/**
 * The single list of available filters. To add a filter, create its file in this
 * folder and add it here; the engine and API pick it up automatically.
 */
export function createDefaultRegistry({ sinkKinds = config.sinkKinds }: DefaultRegistryOptions = {}): FilterRegistry {
  return createRegistry([
    publicStartFilter,
    createSinkFilter({ kinds: sinkKinds }),
    vulnerableFilter,
  ]);
}

export type { FilterRegistry } from "./registry.js";
export { UnknownFilterError } from "./registry.js";
export type { RouteFilter } from "./types.js";
