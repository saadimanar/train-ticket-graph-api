import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${value}"`);
  }
  return port;
}

export const config = {
  port: parsePort(process.env.PORT, 3000),
  dataPath: process.env.GRAPH_DATA_PATH ?? path.join(projectRoot, "data", "train-ticket-graph.json"),
  /** Node kinds treated as sinks by the "sink" filter (D4). */
  sinkKinds: ["rds", "sql"],
} as const;
