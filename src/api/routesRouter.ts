import { Router } from "express";
import type { QueryEngine } from "../engine/queryEngine.js";
import { toRoutesResponse } from "../engine/toResponse.js";
import { UnknownFilterError } from "../filters/registry.js";
import type { Graph } from "../graph/types.js";
import { formatZodIssues } from "../shared/zod.js";
import { HttpError } from "./errors.js";
import { RoutesQuerySchema } from "./querySchema.js";

/** GET /routes?filters=a,b&match=all|any&limit=N (D6, D10). */
export function routesRouter(graph: Graph, engine: QueryEngine): Router {
  const router = Router();

  router.get("/routes", (req, res) => {
    const parsed = RoutesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, "INVALID_QUERY", `Invalid query: ${formatZodIssues(parsed.error)}`);
    }

    let result;
    try {
      result = engine.query(parsed.data);
    } catch (err) {
      if (err instanceof UnknownFilterError) throw new HttpError(400, "UNKNOWN_FILTER", err.message);
      throw err;
    }

    res.json(toRoutesResponse(graph, result));
  });

  return router;
}
