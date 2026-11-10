import { spawnSync } from "node:child_process";
import { cp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { put, tempProject } from "./helpers.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

describe("CLI end-to-end", () => {
  it("shows help, version and rules without requiring a mobile project", () => {
    expect(run("--help").stdout).toContain("Usage: shipcheck");
    expect(run("--version").stdout.trim()).toBe("0.1.0");
    const listed = run("--list-rules");
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("ios/version-format");
    expect(listed.stdout).toContain("metadata/screenshot-counts");
  });
  it("returns 0 for no errors, 1 for warnings under strict mode", () => {
    const root = resolve(fixtures, "ios");
    const result = run(root, "--format", "json");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).summary.error).toBe(0);
    expect(run(root, "--strict").status).toBe(1);
  });
  it("overrides the configured Xcode configuration without guessing or silently skipping", async () => {
    const root = await tempProject();
    const file = "App.xcodeproj/project.pbxproj";
    const pbx = await readFile(resolve(fixtures, "xcode", file), "utf8");
    await put(root, file, pbx.replaceAll("Release", "Firefox"));
    await put(root, "shipcheck.config.json", JSON.stringify({ configuration: "Other" }));
    const missing = run(root, "--format", "json");
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("Available configurations: Firefox");
    const selected = run(root, "--configuration", "Firefox", "--format", "json");
    expect(selected.status, selected.stderr).toBe(0);
    expect(JSON.parse(selected.stdout).summary.error).toBe(0);
    expect(run(root, "--configuration", "").status).toBe(2);
  });
  it("returns 1 with a structured report for release-blocking findings", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "Info.plist", `<?xml version="1.0"?><plist version="1.0"><dict>
      <key>CFBundleVersion</key><string>0</string></dict></plist>`);
    const result = run(root, "--format", "json");
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).findings.some((f: { ruleId: string }) => f.ruleId === "ios/version-format")).toBe(true);
  });
  it("keeps absent local listing assets advisory, with explicit strict and self-contained gates", async () => {
    const root = await tempProject();
    await put(root, "fastlane/metadata/en-US/name.txt", "Example app");
    const advisory = run(root, "--format", "json");
    expect(advisory.status, advisory.stderr).toBe(0);
    expect(JSON.parse(advisory.stdout).findings.every((finding: { ruleId: string }) =>
      finding.ruleId === "metadata/completeness")).toBe(true);
    expect(run(root, "--strict").status).toBe(1);
    await put(root, "shipcheck.config.json", JSON.stringify({ rules: { "metadata/completeness": "error" } }));
    expect(run(root, "--format", "json").status).toBe(1);
    await put(root, "shipcheck.config.json", "{}");
    await put(root, "fastlane/metadata/en-US/keywords.txt", "é".repeat(51));
    const invalid = run(root, "--format", "json");
    expect(invalid.status, invalid.stderr).toBe(1);
    expect(JSON.parse(invalid.stdout).findings.some((finding: { ruleId: string; severity: string }) =>
      finding.ruleId === "metadata/lengths" && finding.severity === "error")).toBe(true);
  });
  it("writes SARIF output without contaminating stdout", async () => {
    const root = await tempProject();
    const output = resolve(root, "result.sarif");
    const result = run(resolve(fixtures, "ios"), "--format", "sarif", "--output", output);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(await readFile(output, "utf8")).version).toBe("2.1.0");
  });
  it.each([
    ["--format", "xml"], ["--platform", "windows"], ["--unknown"],
    ["/not/a/real/project"], ["a", "b"],
  ])("returns execution error 2 for invalid invocation %j", (...args) => {
    const result = run(...args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("shipcheck:");
  });
  it("returns 2 for an unsupported or missing requested platform", async () => {
    expect(run(await tempProject()).status).toBe(2);
    expect(run(resolve(fixtures, "ios"), "--platform", "android").status).toBe(2);
  });
  it("loads plugins and emits plugin findings through the CLI", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "shipcheck.config.json", JSON.stringify({ plugins: ["./plugin.mjs"] }));
    await put(root, "plugin.mjs", `export const rules = [{
      id: "team/release", title: "Team release", platform: "all", severity: "error",
      fix: "Do the release check.", policyUrl: "https://example.com",
      check: () => [{ file: ".", message: "Missing team release approval." }]
    }];`);
    const result = run(root, "--format", "json");
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).findings.some((f: { ruleId: string }) => f.ruleId === "team/release")).toBe(true);
  });
  it("uses CLI SDK overrides instead of config and rejects invalid toolchain declarations", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "shipcheck.config.json", JSON.stringify({ iosSdkVersion: "1.0", xcodeVersion: "1.0" }));
    const result = run(root, "--ios-sdk-version", "99.0", "--xcode-version", "99.0", "--format", "json");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).findings.some((f: { ruleId: string }) => f.ruleId === "ios/sdk-requirements")).toBe(false);
    for (const option of ["--ios-sdk-version", "--xcode-version"]) {
      expect(run(root, option, "26 beta").status).toBe(2);
    }
  });
  it("reports missing SDK coverage without prompting noninteractive invocations", () => {
    const result = run(resolve(fixtures, "ios"), "--format", "json");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).findings.some((f: { ruleId: string }) => f.ruleId === "ios/sdk-coverage")).toBe(true);
  });
  it("prompts only for interactive text scans and accepts or skips a declared SDK", async () => {
    const root = await tempProject();
    const preload = resolve(root, "tty.mjs");
    await put(root, "tty.mjs", `
      Object.defineProperty(process.stdin, "isTTY", { value: true });
      Object.defineProperty(process.stdout, "isTTY", { value: true });
      Object.defineProperty(process.stderr, "isTTY", { value: true });
    `);
    const scan = (args: string[], input: string, ci = "") => spawnSync(process.execPath, [
      "--import", preload, cli, resolve(fixtures, "ios"), ...args,
    ], { encoding: "utf8", input, env: { ...process.env, CI: ci }, timeout: 10000 });
    const accepted = scan([], "99.0\n");
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.stderr).toContain("Which iOS SDK");
    expect(accepted.stdout).not.toContain("[ios/sdk-coverage]");
    const skipped = scan([], "\n");
    expect(skipped.status, skipped.stderr).toBe(0);
    expect(skipped.stdout).toContain("[ios/sdk-coverage]");
    expect(scan([], "not-a-version\n").status).toBe(2);
    for (const args of [
      ["--format", "json"], ["--format", "sarif"], ["--format", "github"],
      ["--no-interactive"], ["--ios-sdk-version", "99.0"], ["--list-rules"],
      ["--output", resolve(root, "report.txt")],
    ]) {
      const result = scan(args, "");
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).not.toContain("Which iOS SDK");
    }
    expect(scan([], "", "true").stderr).not.toContain("Which iOS SDK");
  });
});
