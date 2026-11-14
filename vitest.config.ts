import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      include: ["src/**/*.ts"],
      // Process entry point: only wires things together and calls listen().
      exclude: ["src/index.ts"],
      reporter: ["text", "html"],
    },
  },
});
