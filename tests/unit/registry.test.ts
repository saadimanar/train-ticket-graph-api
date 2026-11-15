import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../../src/filters/index.js";
import { createRegistry, UnknownFilterError } from "../../src/filters/registry.js";
import type { RouteFilter } from "../../src/filters/types.js";

const fake = (name: string): RouteFilter => ({ name, description: name, matches: () => true });

describe("createRegistry", () => {
  it("lists filters in registration order", () => {
    const registry = createRegistry([fake("b"), fake("a")]);
    expect(registry.list().map((f) => f.name)).toEqual(["b", "a"]);
  });

  it("rejects duplicate names at startup", () => {
    expect(() => createRegistry([fake("a"), fake("a")])).toThrow('Duplicate filter name "a"');
  });

  it.each(["", "Public", "has space", "a,b", "-a", "a-"])("rejects the invalid name %j", (name) => {
    expect(() => createRegistry([fake(name)])).toThrow(/Invalid filter name/);
  });

  it("resolves names in request order, dropping duplicates", () => {
    const registry = createRegistry([fake("a"), fake("b")]);
    expect(registry.resolve(["b", "a", "b"]).map((f) => f.name)).toEqual(["b", "a"]);
    expect(registry.resolve([])).toEqual([]);
  });

  it("reports every unknown name and the available ones", () => {
    const registry = createRegistry([fake("a"), fake("b")]);
    let error: unknown;
    try {
      registry.resolve(["a", "x", "y"]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(UnknownFilterError);
    expect((error as UnknownFilterError).unknown).toEqual(["x", "y"]);
    expect((error as Error).message).toBe("Unknown filter(s): x, y. Available filters: a, b");
  });
});

describe("default registry", () => {
  it("registers public, sink and vulnerable", () => {
    expect(createDefaultRegistry().list().map((f) => f.name)).toEqual(["public", "sink", "vulnerable"]);
  });

  it("passes configured sink kinds to the sink filter", () => {
    const registry = createDefaultRegistry({ sinkKinds: ["dynamodb"] });
    const sink = registry.list().find((f) => f.name === "sink");
    expect(sink?.description).toContain("dynamodb");
  });

  it("registers one filter per filter file (guards against a forgotten registration)", () => {
    const infrastructure = new Set(["index.ts", "registry.ts", "types.ts"]);
    const filterFiles = readdirSync(new URL("../../src/filters/", import.meta.url)).filter(
      (file) => file.endsWith(".ts") && !infrastructure.has(file),
    );
    expect(createDefaultRegistry().list()).toHaveLength(filterFiles.length);
  });
});
