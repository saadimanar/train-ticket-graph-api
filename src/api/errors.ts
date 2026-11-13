import type { ErrorRequestHandler, RequestHandler } from "express";

/** Error with an HTTP status and a stable, machine-readable code (D10). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/**
 * Last middleware in the chain. Known HttpErrors are returned as-is; anything
 * else is logged and returned as a generic 500 so internals never leak.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } } satisfies ErrorBody);
    return;
  }
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } } satisfies ErrorBody);
};
