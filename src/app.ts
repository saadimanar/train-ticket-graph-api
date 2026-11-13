import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./api/errors.js";
import { healthRouter } from "./api/healthRouter.js";

/**
 * Builds the Express app without starting a server, so tests can drive it with
 * supertest. Dependencies (graph, filter registry) will be injected here in later
 * phases (D9).
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(healthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
