import type { Express } from "express";
import { createApp } from "./createApp.js";
import { config } from "./config.js";
import { createDefaultRegistry } from "./filters/index.js";
import { loadBundledGraph, loadGraph } from "./graph/loadGraph.js";
import type { Graph } from "./graph/types.js";

/**
 * Entry point for both environments (D13):
 * - Vercel imports this module once per cold start and uses the default export as
 *   the request handler, so the graph is loaded once per instance, not per request.
 * - Locally (`npm run dev` / `npm start`) it also starts an HTTP server.
 */

let graph: Graph;
try {
  graph = config.graphDataPath ? await loadGraph(config.graphDataPath) : loadBundledGraph();
} catch (err) {
  console.error(`Failed to start: ${(err as Error).message}`);
  // On Vercel, fail this cold start (logged, returns 500); locally, exit.
  if (config.isVercel) throw err;
  process.exit(1);
}

if (config.allowedOrigins.length === 0) {
  console.warn("[cors] ALLOWED_ORIGINS is not set: browsers on other origins will be blocked");
} else {
  console.info(`[cors] Allowed origins: ${config.allowedOrigins.join(", ")}`);
}

// Vercel's Express detection requires the entry file to import "express" and
// default-export the app; the typed import below satisfies the first part.
const app: Express = createApp({ graph, registry: createDefaultRegistry(), allowedOrigins: config.allowedOrigins });
export default app;

if (!config.isVercel) {
  const server = app.listen(config.port, () => {
    console.log(`train-ticket-graph-api listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
