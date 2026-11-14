import { readFile } from "node:fs/promises";
import { buildGraph, GraphDataError } from "./buildGraph.js";
import { edgeCount, type Graph } from "./types.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * Reads, parses and validates the graph file once at startup. Recoverable data
 * problems are logged as warnings; an unreadable or structurally invalid file
 * throws GraphDataError (D8).
 */
export async function loadGraph(filePath: string, logger: Logger = console): Promise<Graph> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    throw new GraphDataError(`Cannot read graph file "${filePath}": ${(err as Error).message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new GraphDataError(`Graph file "${filePath}" is not valid JSON: ${(err as Error).message}`);
  }

  const { graph, warnings } = buildGraph(data);
  for (const warning of warnings) {
    logger.warn(`[graph] ${warning.code}: ${warning.message}`);
  }
  logger.info(
    `[graph] Loaded ${graph.nodes.size} nodes and ${edgeCount(graph)} edges from "${filePath}"` +
      (warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""),
  );
  return graph;
}
