import { z } from "zod";
import { config } from "../config.js";

const LIMIT_MESSAGE = `limit must be an integer between 1 and ${config.maxRouteLimit}`;

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
  /**
   * Digits only, with no trimming or coercion: `1e3`, `0x10`, `5.0`, `-1`, ` 5 `
   * and an empty value are all rejected. Absent → the default.
   */
  limit: z
    .string({ error: LIMIT_MESSAGE })
    .regex(/^\d+$/, LIMIT_MESSAGE)
    .transform(Number)
    .pipe(z.number().min(1, LIMIT_MESSAGE).max(config.maxRouteLimit, LIMIT_MESSAGE))
    .default(config.defaultRouteLimit),
});
