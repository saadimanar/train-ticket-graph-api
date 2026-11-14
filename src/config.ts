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

/** Comma-separated list, e.g. "rds,sql". Empty or unset → fallback. */
function parseList(value: string | undefined, fallback: readonly string[]): readonly string[] {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

export const config = {
  port: parsePort(process.env.PORT, 3000),
  dataPath: process.env.GRAPH_DATA_PATH ?? path.join(projectRoot, "data", "train-ticket-graph.json"),
  /** Node kinds treated as sinks by the "sink" filter (D4). Override with SINK_KINDS. */
  sinkKinds: parseList(process.env.SINK_KINDS, ["rds", "sql"]),
  /** GET /routes `limit`: default and maximum (D6). */
  defaultRouteLimit: 1000,
  maxRouteLimit: 10000,
} as const;
