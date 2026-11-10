import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "berthlint-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  execFileSync(npm, ["pack", "--silent", "--pack-destination", temporary], {
    cwd: root, stdio: "inherit",
  });
  const filename = z.array(z.string().endsWith(".tgz")).length(1).parse(await readdir(temporary))[0]!;
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, filename)], {
    cwd: consumer, stdio: "inherit",
  });
  const cli = join(consumer, "node_modules/berthlint/dist/cli.js");
  const version = execFileSync(process.execPath, [cli, "--version"], { cwd: consumer, encoding: "utf8" }).trim();
  const pkg: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (version !== z.object({ version: z.string() }).parse(pkg).version) throw new Error("Installed CLI version mismatch");

  const scan = spawnSync(process.execPath, [
    cli, join(root, "test/fixtures/ios"), "--format", "json", "--ios-sdk-version", "26.0", "--no-plugins",
  ], { cwd: consumer, encoding: "utf8" });
  if (scan.error) throw scan.error;
  if (scan.status !== 0 || scan.stderr) throw new Error(`Installed CLI scan failed (${scan.status}): ${scan.stderr}`);
  const report: unknown = JSON.parse(scan.stdout);
  z.object({ schemaVersion: z.literal(1), summary: z.object({ error: z.literal(0) }) }).parse(report);

  const imported = execFileSync(process.execPath, [
    "--input-type=module", "-e",
    "import { builtInRules, configSchema, requirements, loadSuppressions, suppressionsSchema } from 'berthlint';"
    + "console.log(JSON.stringify({ count: builtInRules.length, sdk: configSchema.parse({iosSdkVersion:'26.0'}).iosSdkVersion,"
    + " schemaVersion: requirements.schemaVersion, suppressions: await loadSuppressions('.'),"
    + " suppressionSchema: suppressionsSchema.parse({schemaVersion:1,suppressions:[]}).schemaVersion }));",
  ], { cwd: consumer, encoding: "utf8" });
  z.object({
    count: z.number().positive(), sdk: z.literal("26.0"), schemaVersion: z.literal(1),
    suppressions: z.array(z.unknown()).length(0), suppressionSchema: z.literal(1),
  })
    .parse(JSON.parse(imported));
  await readFile(join(consumer, "node_modules/berthlint/docs/index.html"), "utf8");
  await readFile(join(consumer, "node_modules/berthlint/SECURITY.md"), "utf8");
  await readFile(join(consumer, "node_modules/berthlint/CHANGELOG.md"), "utf8");
  console.log(`Package ${version}: installed CLI, JSON scan, public ESM exports, requirements data and docs passed.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
