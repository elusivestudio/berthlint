import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config.ts";
import { compareVersions, releaseVersionSchema } from "../src/versions.ts";

describe("declared toolchain versions", () => {
  it.each(["18", "18.5", "26.0", "26.1.1"])("accepts numeric release %s", (value) => {
    expect(releaseVersionSchema.parse(value)).toBe(value);
    expect(configSchema.parse({ iosSdkVersion: value, xcodeVersion: value }))
      .toMatchObject({ iosSdkVersion: value, xcodeVersion: value });
  });
  it.each(["", "0", "0.1", "-1", "26 beta", "iphoneos26.0", "26.0.0.1", "26.", "10000", " 26.0 "])(
    "rejects invalid declared version %j", (value) => {
      expect(configSchema.safeParse({ iosSdkVersion: value }).success).toBe(false);
      expect(configSchema.safeParse({ xcodeVersion: value }).success).toBe(false);
    },
  );
  it.each([
    ["26", "26.0.0", 0], ["26.10", "26.9", 1], ["18.5", "26", -1],
    ["26.0.1", "26.0", 1], ["9.9", "10.0", -1],
  ])("compares %s against %s numerically", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });
});
