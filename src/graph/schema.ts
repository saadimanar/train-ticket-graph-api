import { z } from "zod";

/**
 * Validation of the raw graph file, in two levels (D8):
 *
 * 1. `GraphFileSchema` checks only the top-level shape: `nodes` and `edges` must
 *    be arrays. Their entries are `unknown` so one bad entry cannot fail the parse.
 * 2. `RawNodeSchema` / `RawEdgeSchema` are applied to each entry with `safeParse`;
 *    entries that fail are skipped with a warning.
 */

export const GraphFileSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

const nonEmptyString = z.string().trim().min(1);

/**
 * Deliberately lenient: every field is optional and unknown fields are kept, so
 * an unusual finding never causes its whole node to be dropped.
 */
export const VulnerabilitySchema = z.looseObject({
  file: z.string().optional(),
  severity: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RawNodeSchema = z.object({
  name: nonEmptyString,
  /** Any string: new kinds must not break loading. Sink kinds come from config. */
  kind: nonEmptyString,
  language: z.string().optional(),
  path: z.string().optional(),
  /** Missing on infrastructure nodes (rds/sqs): treated as not exposed. */
  publicExposed: z.boolean().default(false),
  /** Missing on most services: treated as no findings. */
  vulnerabilities: z.array(VulnerabilitySchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RawEdgeSchema = z.object({
  from: nonEmptyString,
  /** Usually an array, but a single string in the data: normalised to an array. */
  to: z.union([nonEmptyString, z.array(nonEmptyString)]).transform((to) => (typeof to === "string" ? [to] : to)),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
export type RawNode = z.infer<typeof RawNodeSchema>;
export type RawEdge = z.infer<typeof RawEdgeSchema>;
