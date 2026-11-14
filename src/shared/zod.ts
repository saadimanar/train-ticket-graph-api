import type { z } from "zod";

/** One-line, human-readable summary of Zod issues: `path: message; path: message`. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
