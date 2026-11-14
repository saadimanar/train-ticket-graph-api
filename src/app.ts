import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./api/errors.js";
import { filtersRouter } from "./api/filtersRouter.js";
import { healthRouter } from "./api/healthRouter.js";
import { routesRouter } from "./api/routesRouter.js";
import { createQueryEngine } from "./engine/queryEngine.js";
import type { FilterRegistry } from "./filters/registry.js";
import type { Graph } from "./graph/types.js";

export interface AppDependencies {
  graph: Graph;
  registry: FilterRegistry;
}

/**
 * Builds the Express app without starting a server. The graph and registry are
 * injected (D9), so tests can run the real app against small fixture graphs.
 */
export function createApp({ graph, registry }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");

  const engine = createQueryEngine(graph, registry);
  app.use(healthRouter());
  app.use(filtersRouter(registry));
  app.use(routesRouter(graph, engine));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
