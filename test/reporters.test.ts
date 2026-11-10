import { describe, expect, it } from "vitest";
import { formatReport } from "../src/reporters.ts";
import { builtInRules } from "../src/rules/index.ts";
import type { Report } from "../src/types.ts";

const report: Report = {
  schemaVersion: 1,
  findings: [{
    ruleId: "ios/version-format", severity: "error", file: "App files/Info.plist", line: 4,
    message: "Bad version", fix: "Set a version.", policyUrl: "https://example.com",
  }],
  summary: { error: 1, warning: 0, note: 0 },
};

describe("reporters", () => {
  it("emits parseable JSON with the exact report shape", () => {
    expect(JSON.parse(formatReport(report, "json", builtInRules))).toEqual(report);
  });
  it("emits SARIF 2.1.0 with valid result levels, indexed rules and encoded artifact URIs", () => {
    const sarif = JSON.parse(formatReport(report, "sarif", builtInRules));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.rules[0].id).toBe("ios/version-format");
    expect(sarif.runs[0].results).toEqual([{
      ruleId: "ios/version-format", ruleIndex: 0, level: "error",
      message: { text: "Bad version\nFix: Set a version.\nhttps://example.com" },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: "App%20files/Info.plist", uriBaseId: "%SRCROOT%" },
          region: { startLine: 4 },
        },
      }],
    }]);
  });
  it("escapes workflow command data and properties to prevent new annotations", () => {
    const unsafe: Report = {
      ...report, findings: [{
        ...report.findings[0]!, severity: "note", file: "a,b:c\nx%y",
        message: "oops\n::error::injected\r100%",
      }],
    };
    const output = formatReport(unsafe, "github", builtInRules);
    expect(output).toContain("::notice file=a%2Cb%3Ac%0Ax%25y,line=4,title=ios/version-format::");
    expect(output).toContain("oops%0A::error::injected%0D100%25");
    expect(output.split("\n")).toHaveLength(1);
  });
  it("includes fixes, policies, counts and limitations in text output", () => {
    const output = formatReport(report, "text", builtInRules);
    expect(output).toContain("| #   | LEVEL   | RULE");
    expect(output).toContain("| 1   | ERROR   | ios/version-format");
    expect(output).toContain("App files/Info.plist:4");
    expect(output).toContain("Bad version");
    expect(output).toContain("Fix: Set a version.");
    expect(output).toContain("Docs: https://example.com");
    expect(output).toContain("1 error | 0 warnings | 0 notes");
    expect(output).toContain("do not guarantee store acceptance");
  });
  it("adds severity colors only when requested for text output", () => {
    const output = formatReport(report, "text", builtInRules, { color: true });
    const errorLabel = output.split("\n").find((line) => line.includes("ERROR"));
    expect(errorLabel).toContain("\u001b[31;1m");
    expect(output).not.toContain("\u001b[41m");
    expect(formatReport(report, "text", builtInRules)).not.toContain("\u001b[");
    expect(formatReport(report, "json", builtInRules, { color: true })).not.toContain("\u001b[");
  });
  it("colors only severity labels: red errors, orange warnings, and blue notes", () => {
    const mixed: Report = {
      ...report,
      findings: [
        report.findings[0]!,
        { ...report.findings[0]!, severity: "warning", ruleId: "ios/usage-descriptions" },
        { ...report.findings[0]!, severity: "note", ruleId: "ios/sdk-coverage" },
      ],
      summary: { error: 1, warning: 1, note: 1 },
    };
    const output = formatReport(mixed, "text", builtInRules, { color: true });
    const table = output.split("\n").filter((line) => line.startsWith("|"));
    const errorRow = table.find((line) => line.includes("| 1   |") && line.includes("ERROR"));
    const warningRow = table.find((line) => line.includes("| 2   |") && line.includes("WARNING"));
    const noteRow = table.find((line) => line.includes("| 3   |") && line.includes("NOTE"));
    expect(errorRow).toContain("\u001b[31;1m");
    expect(warningRow).toContain("\u001b[38;5;208;1m");
    expect(noteRow).toContain("\u001b[34;1m");
    expect(output).not.toMatch(/\u001b\[(?:[0-9;]*;)?4[0-7]m/);
  });
  it("wraps table cells to the requested terminal width", () => {
    const output = formatReport(report, "text", builtInRules, { width: 70 });
    const table = output.split("\n").filter((line) => line.startsWith("|") || line.startsWith("+"));
    expect(table.length).toBeGreaterThan(4);
    expect(table.every((line) => line.length <= 70)).toBe(true);
  });
  it("handles reports with no findings", () => {
    const empty: Report = { schemaVersion: 1, findings: [], summary: { error: 0, warning: 0, note: 0 } };
    expect(formatReport(empty, "github", [])).toBe("");
    expect(JSON.parse(formatReport(empty, "sarif", [])).runs[0].results).toEqual([]);
    expect(formatReport(empty, "text", [])).toContain("No findings.");
  });
});
