import { Router } from "express";
import { toGraphResponse } from "../engine/toResponse.js";
import type { Graph } from "../graph/types.js";

/** GET /graph: the full graph (D11). The data is static, so the body is built once. */
export function graphRouter(graph: Graph): Router {
  const router = Router();
  const body = toGraphResponse(graph);
  router.get("/graph", (_req, res) => {
    res.json(body);
  });
  return router;
}
