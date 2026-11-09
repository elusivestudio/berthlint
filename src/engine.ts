import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve as resolveModule } from "import-meta-resolve";
import { z } from "zod";
import type { Config } from "./config.ts";
import type { Finding, Platform, ProjectModel, Report, Rule, RuleContext, Severity } from "./types.ts";
import { builtInRules } from "./rules/index.ts";

const ruleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  platform: z.enum(["ios", "android", "all"]),
  severity: z.enum(["error", "warning", "note"]),
  policyUrl: z.url(),
  fix: z.string().min(1),
  check: z.custom<Rule["check"]>((value) => typeof value === "function", "check must be a function"),
});

const locationsSchema = z.array(z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  message: z.string().min(1),
  policyUrl: z.url().optional(),
}));

export async function loadRules(root: string, config: Config): Promise<readonly Rule[]> {
  const rules = [...builtInRules];
  for (const specifier of config.plugins) {
    const url = resolveModule(specifier, pathToFileURL(resolve(root, "package.json")).href);
    const module: unknown = await import(url);
    const plugin = z.object({ rules: z.array(ruleSchema) }).safeParse(
      typeof module === "object" && module !== null && "default" in module ? module.default : module,
    );
    if (!plugin.success) throw new Error(`Invalid plugin ${specifier}: ${plugin.error.message}`);
    rules.push(...plugin.data.rules);
  }
  const seen = new Set(["system/analysis"]);
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`Duplicate rule ID: ${rule.id}`);
    seen.add(rule.id);
  }
  for (const id of Object.keys(config.rules)) {
    if (!seen.has(id)) throw new Error(`Unknown configured rule: ${id}`);
  }
  return rules;
}

function configuredSeverity(id: string, fallback: Severity, config: Config): Severity | "off" {
  const setting = config.rules[id];
  return typeof setting === "object" ? setting.severity : setting ?? fallback;
}

export function runRules(
  model: ProjectModel, rules: readonly Rule[], config: Config,
  options: { platform?: Platform; now?: Date } = {},
): Report {
  const platform = options.platform ?? "all";
  const selected: ProjectModel = platform === "all" ? model : {
    ...model,
    ios: platform === "ios" ? model.ios : [],
    android: platform === "android" ? model.android : [],
    privacy: platform === "ios" ? model.privacy : [],
    sources: model.sources.filter((source) => source.platform === platform),
    locales: model.locales.filter((locale) => locale.platform === platform),
  };
  if (platform !== "all" && !selected[platform].length && !selected.locales.length) {
    throw new Error(`No ${platform} app or metadata was found.`);
  }
  const context: RuleContext = {
    defaultLocale: config.defaultLocale, androidDevice: config.androidDevice, now: options.now ?? new Date(),
  };
  const findings: Finding[] = model.diagnostics.flatMap((finding) => {
    const severity = configuredSeverity(finding.ruleId, finding.severity, config);
    return severity === "off" ? [] : [{ ...finding, severity }];
  });
  for (const rule of rules) {
    if (rule.platform !== "all" && platform !== "all" && rule.platform !== platform) continue;
    const severity = configuredSeverity(rule.id, rule.severity, config);
    if (severity === "off") continue;
    try {
      const results = locationsSchema.parse(rule.check(selected, context));
      findings.push(...results.map((result) => ({
        file: result.file, message: result.message,
        ...(result.line !== undefined && { line: result.line }),
        ruleId: rule.id, severity, policyUrl: result.policyUrl ?? rule.policyUrl, fix: rule.fix,
      })));
    } catch (error) {
      throw new Error(`Rule ${rule.id} failed`, { cause: error });
    }
  }
  const rank = { error: 0, warning: 1, note: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]
    || a.file.localeCompare(b.file, "en") || (a.line ?? 0) - (b.line ?? 0)
    || a.ruleId.localeCompare(b.ruleId, "en") || a.message.localeCompare(b.message, "en"));
  const summary: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  for (const finding of findings) summary[finding.severity]++;
  return { schemaVersion: 1, findings, summary };
}
