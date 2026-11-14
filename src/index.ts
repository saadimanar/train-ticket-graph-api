import { createApp } from "./app.js";
import { config } from "./config.js";
import { loadGraph } from "./graph/loadGraph.js";

// Loaded once at startup (D7). An unusable file stops the process with a clear
// message; recoverable data problems were already logged as warnings (D8).
// The graph is passed to createApp in Phase 5.
try {
  await loadGraph(config.dataPath);
} catch (err) {
  console.error(`Failed to start: ${(err as Error).message}`);
  process.exit(1);
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`train-ticket-graph-api listening on http://localhost:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
