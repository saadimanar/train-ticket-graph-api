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
    [{ filter: "public" }, "filter"],
  ])("rejects %j", (query, message) => {
    const result = parse(query);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(message);
  });

  it.each(["1", "25", "10000"])("accepts limit=%j", (limit) => {
    expect(parse({ limit }).data?.limit).toBe(Number(limit));
  });

  it.each([
    ["0"],
    ["10001"],
    ["1e3"],
    ["0x10"],
    ["5.0"],
    ["2.5"],
    ["-1"],
    ["+5"],
    [""],
    [" "],
    [" 5 "],
    ["abc"],
    ["99999999999999999999999"],
    [["1", "2"]],
  ])("rejects limit=%j with one clear message", (limit) => {
    const result = parse({ limit });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "limit must be an integer between 1 and 10000",
    ]);
  });
});
