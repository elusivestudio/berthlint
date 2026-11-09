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
    expect(output).toContain("ERROR App files/Info.plist:4 [ios/version-format]");
    expect(output).toContain("Fix: Set a version.");
    expect(output).toContain("1 error(s), 0 warning(s), 0 note(s)");
    expect(output).toContain("do not guarantee store acceptance");
  });
  it("handles reports with no findings", () => {
    const empty: Report = { schemaVersion: 1, findings: [], summary: { error: 0, warning: 0, note: 0 } };
    expect(formatReport(empty, "github", [])).toBe("");
    expect(JSON.parse(formatReport(empty, "sarif", [])).runs[0].results).toEqual([]);
  });
});
