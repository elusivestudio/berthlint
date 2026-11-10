#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import { loadConfig, errorMessage } from "./config.ts";
import { loadProject } from "./loaders/index.ts";
import { loadRules, runRules } from "./engine.ts";
import { formatReport } from "./reporters.ts";
import { releaseVersionSchema } from "./versions.ts";

const help = `shipcheck - static mobile app release checks

Usage: shipcheck [project-directory] [options]

  --format text|json|sarif|github  Output format (default: text)
  --output <file>                 Write report to a file instead of stdout
  --platform all|ios|android      Limit rule evaluation (default: all)
  --config <file>                Config path, relative to project directory
  --configuration <name>          Xcode build configuration (default: Release)
  --ios-sdk-version <version>     Declared iOS build SDK (not deployment target)
  --xcode-version <version>       Declared Xcode release version
  --no-interactive                Never prompt for a missing iOS SDK version
  --strict                       Fail on warnings as well as errors
  --list-rules                   List built-in and configured plugin rules
  --help, -h                     Show usage
  --version, -v                  Show version

Reads native .xcodeproj/Info.plist/PrivacyInfo.xcprivacy,
Android src/main/AndroidManifest.xml and literal build.gradle(.kts) settings,
and fastlane/metadata layouts. No build or store credentials required.

Exit codes: 0 = no blocking findings, 1 = blocking findings, 2 = execution error.
Plugins are trusted executable code; only configure packages you trust.`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      format: { type: "string", default: "text" },
      output: { type: "string" },
      platform: { type: "string", default: "all" },
      config: { type: "string" },
      configuration: { type: "string" },
      "ios-sdk-version": { type: "string" },
      "xcode-version": { type: "string" },
      "no-interactive": { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      "list-rules": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.version) {
    const pkg: unknown = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(z.object({ version: z.string() }).parse(pkg).version);
    return;
  }
  if (positionals.length > 1) throw new Error("Expected at most one project directory.");
  const format = z.enum(["text", "json", "sarif", "github"]).parse(values.format);
  const platform = z.enum(["all", "ios", "android"]).parse(values.platform);
  const root = resolve(positionals[0] ?? ".");
  const config = await loadConfig(root, values.config);
  if (values.configuration !== undefined) {
    config.configuration = z.string().min(1).parse(values.configuration);
  }
  if (values["ios-sdk-version"] !== undefined) {
    config.iosSdkVersion = releaseVersionSchema.parse(values["ios-sdk-version"]);
  }
  if (values["xcode-version"] !== undefined) {
    config.xcodeVersion = releaseVersionSchema.parse(values["xcode-version"]);
  }
  const rules = await loadRules(root, config);
  if (values["list-rules"]) {
    console.log(rules.map((rule) => `${rule.id}\t${rule.severity}\t${rule.title}`).join("\n"));
    return;
  }
  const model = await loadProject(root, config, { platform });
  if (!config.iosSdkVersion && model.ios.length && format === "text" && !values.output
    && !values["no-interactive"] && !process.env.CI
    && process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY
    && config.rules["ios/sdk-requirements"] !== "off"
    && !(typeof config.rules["ios/sdk-requirements"] === "object"
      && config.rules["ios/sdk-requirements"].severity === "off")) {
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = (await terminal.question(
        "Which iOS SDK will build this release? This is not the deployment target (e.g. 26.0; Enter to skip): ",
      )).trim();
      if (answer) config.iosSdkVersion = releaseVersionSchema.parse(answer);
    } finally {
      terminal.close();
    }
  }
  const report = runRules(model, rules, config, { platform });
  const output = formatReport(report, format, rules);
  if (values.output) await writeFile(resolve(values.output), `${output}\n`, "utf8");
  else console.log(output);
  process.exitCode = report.summary.error > 0 || (values.strict && report.summary.warning > 0) ? 1 : 0;
}

try {
  await main();
} catch (error) {
  const messages = [errorMessage(error)];
  let cause = error instanceof Error ? error.cause : undefined;
  const seen = new Set<unknown>();
  while (cause && !seen.has(cause)) {
    seen.add(cause);
    messages.push(errorMessage(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  console.error(`shipcheck: ${messages.join(": ")}`);
  process.exitCode = 2;
}
