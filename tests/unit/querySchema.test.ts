import { describe, expect, it } from "vitest";
import { RoutesQuerySchema } from "../../src/api/querySchema.js";

const parse = (query: Record<string, unknown>) => RoutesQuerySchema.safeParse(query);

describe("RoutesQuerySchema", () => {
  it("applies defaults", () => {
    expect(parse({}).data).toEqual({ filters: [], match: "all", limit: 1000 });
  });

  it.each([
    ["public,sink", ["public", "sink"]],
    [" public , sink ", ["public", "sink"]],
    ["public,,", ["public"]],
    ["", []],
    [["public", "sink,vulnerable"], ["public", "sink", "vulnerable"]],
  ])("parses filters=%j", (filters, expected) => {
    expect(parse({ filters }).data?.filters).toEqual(expected);
  });

  it("accepts match=any and a numeric limit", () => {
    expect(parse({ match: "any", limit: "25" }).data).toMatchObject({ match: "any", limit: 25 });
  });

  it.each([
    [{ match: "either" }, "match"],
    [{ limit: "0" }, "at least 1"],
    [{ limit: "10001" }, "at most 10000"],
    [{ limit: "2.5" }, "integer"],
    [{ limit: "abc" }, "integer"],
    [{ limit: ["1", "2"] }, "integer"],
    [{ filter: "public" }, "filter"],
  ])("rejects %j", (query, message) => {
    const result = parse(query);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(message);
  });
});
