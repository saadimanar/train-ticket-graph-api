import type { RouteFilter } from "./types.js";

/** Requested filter names that are not registered. Mapped to HTTP 400 by the API. */
export class UnknownFilterError extends Error {
  constructor(
    readonly unknown: readonly string[],
    readonly available: readonly string[],
  ) {
    super(`Unknown filter(s): ${unknown.join(", ")}. Available filters: ${available.join(", ")}`);
    this.name = "UnknownFilterError";
  }
}

export interface FilterRegistry {
  /** All filters, in registration order. */
  list(): readonly RouteFilter[];
  /**
   * Looks up filters by name, preserving order and dropping duplicates.
   * @throws UnknownFilterError listing every unknown name at once.
   */
  resolve(names: readonly string[]): RouteFilter[];
}

/** Names travel in a comma-separated query param, so keep them simple. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @throws Error at startup on an invalid or duplicate filter name. */
export function createRegistry(filters: readonly RouteFilter[]): FilterRegistry {
  const byName = new Map<string, RouteFilter>();
  for (const filter of filters) {
    if (!NAME_PATTERN.test(filter.name)) {
      throw new Error(`Invalid filter name "${filter.name}": use lowercase letters, digits and dashes`);
    }
    if (byName.has(filter.name)) {
      throw new Error(`Duplicate filter name "${filter.name}"`);
    }
    byName.set(filter.name, filter);
  }
  const all = Object.freeze([...byName.values()]);

  return {
    list: () => all,
    resolve(names) {
      const unique = [...new Set(names)];
      const unknown = unique.filter((name) => !byName.has(name));
      if (unknown.length > 0) throw new UnknownFilterError(unknown, [...byName.keys()]);
      return unique.map((name) => byName.get(name)!);
    },
  };
}
