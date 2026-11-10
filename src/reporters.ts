import type { Report, Rule } from "./types.ts";

export type Format = "text" | "json" | "sarif" | "github";

function workflowEscape(value: string, property = false): string {
  const escaped = value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? escaped.replaceAll(":", "%3A").replaceAll(",", "%2C") : escaped;
}

function singleLine(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, " ");
}

export function formatReport(report: Report, format: Format, rules: readonly Rule[]): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "github") return report.findings.map((finding) => {
    const level = finding.severity === "note" ? "notice" : finding.severity;
    const file = workflowEscape(finding.file, true);
    const title = workflowEscape(finding.ruleId, true);
    return `::${level} file=${file}${finding.line ? `,line=${finding.line}` : ""},title=${title}::`
      + workflowEscape(`${finding.message} Fix: ${finding.fix} ${finding.policyUrl}`);
  }).join("\n");
  if (format === "sarif") {
    const byId = new Map(rules.map((rule) => [rule.id, rule]));
    const used = [...new Set(report.findings.map((finding) => finding.ruleId))];
    return JSON.stringify({
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [{
        tool: {
          driver: {
            name: "berthlint",
            rules: used.map((id) => ({
              id,
              shortDescription: { text: byId.get(id)?.title ?? "Analysis coverage" },
              helpUri: byId.get(id)?.policyUrl ?? "https://docs.fastlane.tools/",
              help: { text: byId.get(id)?.fix ?? "Review the analysis diagnostic." },
            })),
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId, ruleIndex: used.indexOf(finding.ruleId), level: finding.severity,
          message: { text: `${finding.message}\nFix: ${finding.fix}\n${finding.policyUrl}` },
          locations: [{
            physicalLocation: {
              artifactLocation: {
                uri: finding.file.split("/").map(encodeURIComponent).join("/"),
                uriBaseId: "%SRCROOT%",
              },
              ...(finding.line && { region: { startLine: finding.line } }),
            },
          }],
        })),
      }],
    }, null, 2);
  }
  const lines = report.findings.map((finding) =>
    `${finding.severity.toUpperCase()} ${singleLine(finding.file)}${finding.line ? `:${finding.line}` : ""} [${finding.ruleId}]\n`
    + `  ${singleLine(finding.message)}\n  Fix: ${singleLine(finding.fix)}\n  ${singleLine(finding.policyUrl)}`);
  const { error, warning, note } = report.summary;
  lines.push(`${error} error(s), ${warning} warning(s), ${note} note(s). Static checks do not guarantee store acceptance.`);
  return lines.join("\n\n");
}
