import { describe, expect, it } from "vitest";
import { loadRules, runRules } from "../src/engine.ts";
import { configSchema } from "../src/config.ts";
import { loadSuppressions, suppressionsSchema } from "../src/suppressions.ts";
import { config, context, model, put, tempProject } from "./helpers.ts";
import type { Finding, Rule } from "../src/types.ts";

const entry = {
  ruleId: "team/release", file: "App.swift", message: "Review this release.",
  reason: "Accepted temporarily; tracked in release checklist.",
};
const rule: Rule = {
  id: entry.ruleId, title: "Release check", platform: "all", severity: "warning",
  policyUrl: "https://example.com", fix: "Review the release.",
  check: () => [{ file: entry.file, message: entry.message, line: 12 }],
};
const document = (suppressions: unknown[]) => ({ schemaVersion: 1, suppressions });

describe("suppressions", () => {
  it("loads optional defaults and explicit project-relative paths", async () => {
    const root = await tempProject();
    expect(await loadSuppressions(root)).toEqual([]);
    await expect(loadSuppressions(root, "missing.json")).rejects.toThrow("Cannot read suppressions");
    await put(root, "berthlint.suppressions.json", JSON.stringify(document([entry])));
    expect(await loadSuppressions(root)).toEqual([entry]);
    await put(root, "config/accepted.json", JSON.stringify(document([])));
    expect(await loadSuppressions(root, "config/accepted.json")).toEqual([]);
  });
  it.each([
    "{", JSON.stringify({ schemaVersion: 2, suppressions: [] }),
    JSON.stringify(document([{ ...entry, reason: " " }])),
    JSON.stringify(document([{ ...entry, extra: true }])),
    JSON.stringify(document([entry, entry])),
  ])("rejects malformed or duplicate suppressions: %s", async (text) => {
    const root = await tempProject();
    await put(root, "berthlint.suppressions.json", text);
    await expect(loadSuppressions(root)).rejects.toThrow("Invalid suppressions");
  });
  it.each(["/App.swift", "../App.swift", "./App.swift", "a//b", "a/../b", "C:/App.swift",
    "App\\Info.plist", "**/*.swift", "App?.swift", "[ab].swift", ""])("rejects non-exact path %s", (file) => {
    expect(suppressionsSchema.safeParse(document([{ ...entry, file }])).success).toBe(false);
  });
  it("matches rule, path and message exactly, ignoring moving source lines", () => {
    const results = [
      { file: entry.file, message: entry.message, line: 99 },
      { file: entry.file, message: "New release problem." },
      { file: "Other.swift", message: entry.message },
    ];
    const report = runRules(model(), [
      { ...rule, check: () => results },
      { ...rule, id: "team/other" },
    ], config, { now: context.now, suppressions: [entry] });
    expect(report.findings).toHaveLength(3);
    expect(report.findings.some((finding) => finding.line === 99)).toBe(false);
    expect(report.summary).toEqual({ error: 0, warning: 3, note: 0 });
  });
  it("applies to loader diagnostics and preserves report shape and severity overrides", () => {
    const diagnostic: Finding = {
      ruleId: "system/analysis", file: ".", message: "Coverage missing.",
      severity: "warning", policyUrl: "https://example.com", fix: "Review coverage.",
    };
    const suppressions = [entry, {
      ruleId: diagnostic.ruleId, file: diagnostic.file, message: diagnostic.message, reason: entry.reason,
    }];
    const report = runRules(model({ diagnostics: [diagnostic] }), [rule],
      configSchema.parse({ rules: { [rule.id]: "error" } }), { suppressions, now: context.now });
    expect(report).toEqual({ schemaVersion: 1, findings: [], summary: { error: 0, warning: 0, note: 0 } });
  });
  it("rejects unknown rule IDs and malformed programmatic entries", () => {
    expect(() => runRules(model(), [], config, { suppressions: [entry] }))
      .toThrow("Unknown suppressed rule: team/release");
    expect(() => runRules(model(), [rule], config, { suppressions: [{ ...entry, reason: "" }] }))
      .toThrow();
  });
  it("still executes rules and surfaces their failures before suppressing results", () => {
    expect(() => runRules(model(), [{
      ...rule, check() { throw new Error("Broken check"); },
    }], config, { suppressions: [entry] })).toThrow("Rule team/release failed");
  });
});

describe("plugin opt-out API", () => {
  it("skips even plugin resolution and import while retaining built-in checks", async () => {
    const root = await tempProject();
    const configured = configSchema.parse({ plugins: ["./missing.mjs"] });
    await expect(loadRules(root, configured)).rejects.toThrow();
    const rules = await loadRules(root, configured, { plugins: false });
    expect(rules.some((rule) => rule.id === "ios/version-format")).toBe(true);
    expect(rules.some((rule) => rule.id === entry.ruleId)).toBe(false);
  });
  it("does not silently accept unknown rule overrides when plugins are disabled", async () => {
    await expect(loadRules(await tempProject(), configSchema.parse({
      plugins: ["./missing.mjs"], rules: { "team/release": "off" },
    }), { plugins: false })).rejects.toThrow("Unknown configured rule: team/release");
  });
});
