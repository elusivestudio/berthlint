import type { Report, Rule } from "./types.ts";

export type Format = "text" | "json" | "sarif" | "github";

function workflowEscape(value: string, property = false): string {
  const escaped = value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? escaped.replaceAll(":", "%3A").replaceAll(",", "%2C") : escaped;
}

function singleLine(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, " ");
}

const colors = {
  error: "\u001b[31;1m",
  warning: "\u001b[38;5;208;1m",
  note: "\u001b[34;1m",
  reset: "\u001b[0m",
} as const;

function colorize(value: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${value}${colors.reset}` : value;
}

function wrapText(value: string, width: number): string[] {
  const words = singleLine(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      line = "";
      for (let offset = 0; offset < word.length; offset += width) {
        const part = word.slice(offset, offset + width);
        if (part.length === width) lines.push(part);
        else line = part;
      }
    } else if (!line) {
      line = word;
    } else if (line.length + word.length + 1 <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function renderTable(
  rows: readonly (readonly string[])[],
  widths: readonly number[],
  color: boolean,
): string {
  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const renderRow = (cells: readonly string[], header = false): string => {
    const wrapped = cells.map((cell, index) => wrapText(cell, widths[index]!));
    const height = Math.max(...wrapped.map((lines) => lines.length));
    const severity = header ? undefined : cells[1]?.toLowerCase();
    const lines = Array.from({ length: height }, (_, lineIndex) => {
      const values = wrapped.map((cellLines, index) => {
        const cell = cellLines[lineIndex] ?? "";
        const padded = cell.padEnd(widths[index]!);
        if (header) return colorize(padded, "\u001b[1m", color);
        if (index === 1 && lineIndex === 0
          && (severity === "error" || severity === "warning" || severity === "note")) {
          return colorize(padded, colors[severity], color);
        }
        return padded;
      });
      return `| ${values.join(" | ")} |`;
    });
    return lines.join("\n");
  };
  return [
    border,
    renderRow(rows[0]!, true),
    border,
    ...rows.slice(1).map((row) => renderRow(row)),
    border,
  ].join("\n");
}

export function formatReport(
  report: Report,
  format: Format,
  rules: readonly Rule[],
  options: { color?: boolean; width?: number } = {},
): string {
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
  const { color = false } = options;
  const counts = (["error", "warning", "note"] as const)
    .map((severity) => colorize(
      `${report.summary[severity]} ${severity}${report.summary[severity] === 1 ? "" : "s"}`,
      colors[severity],
      color && report.summary[severity] > 0,
    ))
    .join(" | ");
  const lines = [
    "berthlint",
    counts,
  ];
  if (report.findings.length > 0) {
    const tableWidth = Math.max(70, Math.min(160, Math.floor(options.width ?? 120)));
    const indexWidth = Math.max(3, String(report.findings.length).length);
    const innerWidth = tableWidth - 16;
    const remaining = innerWidth - indexWidth - 7;
    const ruleWidth = Math.min(36, Math.max(12, Math.floor(remaining * 0.34)));
    const locationWidth = Math.min(32, Math.max(14, Math.floor(remaining * 0.27)));
    const widths = [indexWidth, 7, ruleWidth, locationWidth, innerWidth - indexWidth - 7 - ruleWidth - locationWidth];
    const rows = [
      ["#", "LEVEL", "RULE", "LOCATION", "FINDING"],
      ...report.findings.map((finding, index) => [
        String(index + 1),
        finding.severity.toUpperCase(),
        finding.ruleId,
        `${finding.file}${finding.line ? `:${finding.line}` : ""}`,
        finding.message,
      ]),
    ];
    lines.push(renderTable(rows, widths, color));
    lines.push("Details");
    report.findings.forEach((finding, index) => {
      const prefix = `  ${index + 1}. `;
      const continuation = " ".repeat(prefix.length);
      const wrapDetail = (label: string, value: string): string => {
        const firstPrefix = `${prefix}${label}: `;
        const restPrefix = `${continuation}${" ".repeat(label.length + 2)}`;
        const textWidth = Math.max(1, tableWidth - firstPrefix.length);
        return wrapText(value, textWidth)
          .map((part, lineIndex) => `${lineIndex === 0 ? firstPrefix : restPrefix}${part}`)
          .join("\n");
      };
      lines.push(`${wrapDetail("Fix", finding.fix)}\n${wrapDetail("Docs", finding.policyUrl)}`);
    });
  }
  if (report.findings.length === 0) lines.push("No findings.");
  lines.push("Static checks do not guarantee store acceptance.");
  return lines.join("\n\n");
}
