import { z } from "zod";
import { config } from "../config.js";

/**
 * Query params of GET /routes (D6). Strict: an unknown param (e.g. the typo
 * `filter=public`) is a 400, rather than silently returning every route.
 */
export const RoutesQuerySchema = z.strictObject({
  /**
   * Comma-separated names: `filters=public,sink`. A repeated param
   * (`filters=public&filters=sink`) is accepted too. Blank entries are ignored.
   */
  filters: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      [value ?? []]
        .flat()
        .flatMap((part) => part.split(","))
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  match: z.enum(["all", "any"]).default("all"),
  limit: z.coerce
    .number<string>({ error: "limit must be an integer" })
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(config.maxRouteLimit, `limit must be at most ${config.maxRouteLimit}`)
    .default(config.defaultRouteLimit),
});

export type RoutesQuery = z.infer<typeof RoutesQuerySchema>;
