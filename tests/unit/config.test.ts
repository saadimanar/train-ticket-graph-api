import { describe, expect, it } from "vitest";
import { DEV_FRONTEND_ORIGIN, parseAllowedOrigins, parseList, parsePort } from "../../src/config.js";

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

describe("parseAllowedOrigins", () => {
  it("defaults to the Vite dev origin outside production", () => {
    expect(parseAllowedOrigins(undefined, "development")).toEqual([DEV_FRONTEND_ORIGIN]);
    expect(parseAllowedOrigins(undefined, undefined)).toEqual(["http://localhost:5173"]);
  });

  it("defaults to nothing in production", () => {
    expect(parseAllowedOrigins(undefined, "production")).toEqual([]);
    expect(parseAllowedOrigins("  ", "production")).toEqual([]);
  });

  it("parses a comma-separated list and tolerates spaces and trailing slashes", () => {
    expect(parseAllowedOrigins(" https://a.example.com/, http://localhost:5173 ", "production")).toEqual([
      "https://a.example.com",
      "http://localhost:5173",
    ]);
  });

  it.each(["localhost:5173", "https://a.example.com/app", "not a url", "https://a.example.com?x=1"])(
    "rejects %j at startup",
    (value) => {
      expect(() => parseAllowedOrigins(value, "production")).toThrow(/Invalid origin in ALLOWED_ORIGINS/);
    },
  );
});
