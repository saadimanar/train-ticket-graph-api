import cors from "cors";
import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./api/errors.js";
import { filtersRouter } from "./api/filtersRouter.js";
import { graphRouter } from "./api/graphRouter.js";
import { healthRouter } from "./api/healthRouter.js";
import { routesRouter } from "./api/routesRouter.js";
import { createQueryEngine } from "./engine/queryEngine.js";
import type { FilterRegistry } from "./filters/registry.js";
import type { Graph } from "./graph/types.js";

export interface AppDependencies {
  graph: Graph;
  registry: FilterRegistry;
  /** Exact origins allowed by CORS (D12). Default: none (same-origin only). */
  allowedOrigins?: readonly string[];
}

/**
 * Builds the Express app without starting a server. The graph and registry are
 * injected (D9), so tests can run the real app against small fixture graphs, and
 * the same app serves both local development and the Vercel function (D13).
 */
export function createApp({ graph, registry, allowedOrigins = [] }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");

  // Read-only API: only GET (and the preflight OPTIONS) is allowed cross-origin.
  // A disallowed origin gets no CORS headers, so the browser blocks the response.
  app.use(cors({ origin: [...allowedOrigins], methods: ["GET"], maxAge: 600 }));

  const engine = createQueryEngine(graph, registry);
  app.use(healthRouter());
  app.use(filtersRouter(registry));
  app.use(graphRouter(graph));
  app.use(routesRouter(graph, engine));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
