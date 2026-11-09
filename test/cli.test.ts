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
  it("returns 1 with a structured report for release-blocking findings", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "Info.plist", `<?xml version="1.0"?><plist version="1.0"><dict>
      <key>CFBundleVersion</key><string>0</string></dict></plist>`);
    const result = run(root, "--format", "json");
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).findings.some((f: { ruleId: string }) => f.ruleId === "ios/version-format")).toBe(true);
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
});
