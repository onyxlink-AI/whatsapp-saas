import { describe, expect, it } from "vitest";
import { config } from "../../../middleware";

const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("middleware public asset boundary", () => {
  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/icon.png",
    "/brand/onyxlink-logo.png",
    "/avatars/default.png",
  ])("does not run authentication middleware for %s", (pathname) => {
    expect(matcher.test(pathname)).toBe(false);
  });

  it.each(["/dashboard", "/settings", "/oficina-virtual"])(
    "keeps the private page %s behind authentication middleware",
    (pathname) => {
      expect(matcher.test(pathname)).toBe(true);
    },
  );

  it("leaves API authorization to each server route", () => {
    expect(matcher.test("/api/workspace/example/private")).toBe(false);
  });
});
