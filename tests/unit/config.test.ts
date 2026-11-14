import { describe, expect, it } from "vitest";
import { parseList, parsePort } from "../../src/config.js";

describe("parsePort", () => {
  it("uses the fallback when unset or empty", () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort("", 3000)).toBe(3000);
  });

  it("parses a valid port", () => {
    expect(parsePort("8080", 3000)).toBe(8080);
  });

  it.each(["abc", "-1", "65536", "80.5"])("rejects %j", (value) => {
    expect(() => parsePort(value, 3000)).toThrow(/Invalid PORT/);
  });
});

describe("parseList", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseList(" rds, sql ,,", ["x"])).toEqual(["rds", "sql"]);
  });

  it("uses the fallback when unset or blank", () => {
    expect(parseList(undefined, ["rds"])).toEqual(["rds"]);
    expect(parseList(" , ", ["rds"])).toEqual(["rds"]);
  });
});
