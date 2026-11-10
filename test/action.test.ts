import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { put, tempProject } from "./helpers.ts";

describe("composite Action arguments", () => {
  it.each([true, false])("forwards plugin opt-out %s and exact suppression paths safely", async (disabled) => {
    const root = await tempProject();
    await put(root, "dist/cli.js", "console.log(JSON.stringify(process.argv.slice(2)))");
    const action = await readFile(new URL("../action.yml", import.meta.url), "utf8");
    const block = action.split("run: |").at(-1);
    if (!block) throw new Error("Missing Action scan command");
    const script = block.replace(/^ {8}/gm, "");
    const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTION_PATH: root,
        BERTHLINT_PATH: "mobile app",
        BERTHLINT_PLATFORM: "ios",
        BERTHLINT_STRICT: "true",
        BERTHLINT_CONFIG: "config/trusted config.json",
        BERTHLINT_NO_PLUGINS: String(disabled),
        BERTHLINT_SUPPRESSIONS: "config/accepted $(false).json",
        BERTHLINT_IOS_SDK: "26.0",
        BERTHLINT_XCODE: "26.0",
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "mobile app", "--format", "github", "--platform", "ios", "--strict",
      "--config", "config/trusted config.json",
      ...(disabled ? ["--no-plugins"] : []),
      "--suppressions", "config/accepted $(false).json",
      "--ios-sdk-version", "26.0", "--xcode-version", "26.0",
    ]);
  });
});

describe("publish workflow release guard", () => {
  it.each([
    ["refs/tags/v0.1.0", 0],
    ["refs/heads/main", 1],
    ["refs/tags/v0.0.9", 1],
  ])("requires the manifest version tag: %s", async (ref, status) => {
    const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
    const script = workflow.match(/<<'JS'\n([\s\S]*?)^\s+JS$/m)?.[1];
    if (!script) throw new Error("Missing publish workflow release guard");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8", env: { ...process.env, GITHUB_REF: ref },
    });
    expect(result.status, result.stderr).toBe(status);
    if (status !== 0) expect(result.stderr).toContain("Select the v0.1.0 tag");
  });
});
