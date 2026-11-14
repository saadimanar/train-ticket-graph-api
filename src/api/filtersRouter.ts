import { Router } from "express";
import type { FilterRegistry } from "../filters/registry.js";

/** GET /filters: built from the registry, so new filters appear automatically. */
export function filtersRouter(registry: FilterRegistry): Router {
  const router = Router();
  router.get("/filters", (_req, res) => {
    res.json({ filters: registry.list().map(({ name, description }) => ({ name, description })) });
  });
  return router;
}
