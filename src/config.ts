export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${value}"`);
  }
  return port;
}

/** Comma-separated list, e.g. "rds,sql". Empty or unset → fallback. */
export function parseList(value: string | undefined, fallback: readonly string[]): readonly string[] {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

/** Origin the frontend dev server (Vite) runs on; allowed by default outside production. */
export const DEV_FRONTEND_ORIGIN = "http://localhost:5173";

/**
 * CORS allow-list from ALLOWED_ORIGINS (D12). Each entry must be an exact origin
 * (`scheme://host[:port]`, no path); a trailing slash is tolerated. Invalid entries
 * fail startup so a typo can't silently block the frontend.
 * Unset: the Vite dev origin outside production, nothing in production.
 */
export function parseAllowedOrigins(value: string | undefined, nodeEnv: string | undefined): readonly string[] {
  const fallback = nodeEnv === "production" ? [] : [DEV_FRONTEND_ORIGIN];
  return parseList(value, fallback).map((entry) => {
    const candidate = entry.replace(/\/+$/, "");
    let origin: string;
    try {
      origin = new URL(candidate).origin;
    } catch {
      throw new Error(`Invalid origin in ALLOWED_ORIGINS: "${entry}" (expected e.g. https://app.example.com)`);
    }
    if (origin !== candidate) {
      throw new Error(`Invalid origin in ALLOWED_ORIGINS: "${entry}" (use only scheme://host[:port])`);
    }
    return origin;
  });
}

export const config = {
  port: parsePort(process.env.PORT, 3000),
  /**
   * Optional path to a graph file. Unset: the bundled data/train-ticket-graph.json
   * (imported, so serverless bundlers always include it; D13).
   */
  graphDataPath: process.env.GRAPH_DATA_PATH || undefined,
  /** Node kinds treated as sinks by the "sink" filter (D4). Override with SINK_KINDS. */
  sinkKinds: parseList(process.env.SINK_KINDS, ["rds", "sql"]),
  /** GET /routes `limit`: default and maximum (D6). */
  defaultRouteLimit: 1000,
  maxRouteLimit: 10000,
  /** Origins allowed to call the API from a browser (D12). */
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS, process.env.NODE_ENV),
  /** True when running as a Vercel function (Vercel sets VERCEL=1). */
  isVercel: Boolean(process.env.VERCEL),
} as const;
