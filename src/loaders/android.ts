import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { Config } from "../config.ts";
import type { AndroidApp, Finding } from "../types.ts";
import { flutterVersion, object, readManifest, string, stripComments } from "./helpers.ts";
import { resolveGradleValues, usesAndroidApplicationPlugin, type GradleInputs } from "./gradle.ts";

export function parseGradle(text: string): {
  targetSdk?: number; versionCode?: number; versionName?: string;
} {
  const clean = stripComments(text);
  const number = (name: string): number | undefined => {
    const match = clean.match(new RegExp(`\\b${name}(?:Version)?\\s*(?:=\\s*|\\(\\s*)?(\\d+)\\b(?=\\s*(?:\\)|;|\\r?$))`, "m"));
    return match?.[1] ? Number(match[1]) : undefined;
  };
  const targetSdk = number("targetSdk");
  const versionCode = number("versionCode");
  const versionName = clean.match(/\bversionName\s*(?:=\s*|\(\s*)?["']([^"']+)["']/)?.[1];
  return {
    ...(targetSdk !== undefined && { targetSdk }),
    ...(versionCode !== undefined && { versionCode }),
    ...(versionName !== undefined && { versionName }),
  };
}

export async function loadAndroid(
  root: string, files: readonly string[], config: Config, diagnostics: Finding[],
): Promise<AndroidApp[]> {
  const readInput = async (path: string): Promise<string | undefined> =>
    files.includes(path) ? readFile(resolve(root, path), "utf8") : undefined;
  const [versionCatalog, gradleProperties] = await Promise.all([
    readInput("gradle/libs.versions.toml"), readInput("gradle.properties"),
  ]);
  const currentInputs: GradleInputs = {
    ...(versionCatalog !== undefined && { versionCatalog }),
    ...(gradleProperties !== undefined && { gradleProperties }),
  };
  const apps: AndroidApp[] = [];
  for (const manifestFile of files.filter((f) => /(?:^|\/)src\/main\/AndroidManifest\.xml$/.test(f)
    || f === "AndroidManifest.xml")) {
    const manifest = await readManifest(resolve(root, manifestFile));
    if (!("application" in manifest)) continue;
    const module = manifestFile === "AndroidManifest.xml" ? "." : dirname(dirname(dirname(manifestFile)));
    const gradle = files.find((f) => f === `${module === "." ? "" : `${module}/`}build.gradle.kts`
      || f === `${module === "." ? "" : `${module}/`}build.gradle`);
    const text = gradle ? await readFile(resolve(root, gradle), "utf8") : "";
    if (gradle && !/\bcom\.android\.application\b|\bapplication\b/.test(stripComments(text))
      && !usesAndroidApplicationPlugin(text, currentInputs)) {
      diagnostics.push({
        ruleId: "system/analysis", severity: "warning", file: gradle,
        message: "Cannot confirm this module uses the Android application plugin.",
        fix: "Confirm whether this is a release app module and that any plugin alias resolves to com.android.application.",
        policyUrl: "https://developer.android.com/build",
      });
    }
    const parsed = { ...parseGradle(text), ...resolveGradleValues(text, currentInputs) };
    const sdk = Number(object(manifest["uses-sdk"])["android:targetSdkVersion"]);
    const code = Number(manifest["android:versionCode"]);
    let previousVersionCode = config.previousAndroidVersionCode;
    if (config.baselineTag) {
      if (!gradle) throw new Error(`${manifestFile}: baselineTag needs a module build.gradle(.kts)`);
      const gitRoot = execFileSync("git", ["rev-parse", "--show-prefix"], { cwd: root, encoding: "utf8" }).trim();
      const previous = execFileSync("git", ["show", `${config.baselineTag}:${gitRoot}${gradle}`], {
        cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
      const baselineInputs: GradleInputs = {};
      const readBaselineInput = (path: string): string | undefined => {
        try {
          return execFileSync("git", ["show", `${config.baselineTag}:${gitRoot}${path}`], {
            cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          const stderr = error instanceof Error && "stderr" in error
            ? String(error.stderr) : "";
          const message = error instanceof Error ? error.message : String(error);
          if (/does not exist in|exists on disk, but not in/.test(stderr)
            || /does not exist in|exists on disk, but not in/.test(message)) return undefined;
          throw new Error(`Cannot read ${config.baselineTag}:${path}`, { cause: error });
        }
      };
      const baselineCatalog = readBaselineInput("gradle/libs.versions.toml");
      const baselineProperties = readBaselineInput("gradle.properties");
      if (baselineCatalog !== undefined) baselineInputs.versionCatalog = baselineCatalog;
      if (baselineProperties !== undefined) baselineInputs.gradleProperties = baselineProperties;
      previousVersionCode = parseGradle(previous).versionCode
        ?? resolveGradleValues(previous, baselineInputs).versionCode;
      if (previousVersionCode === undefined) {
        throw new Error(`Cannot resolve versionCode in ${config.baselineTag}:${gradle} using baseline Gradle inputs`);
      }
    }
    const clean = stripComments(text);
    if (/\bversionCodeOverride\b|\bapplicationVariants\b|\boutput\.versionCode\.set\s*\(/.test(clean)
      || [...clean.matchAll(/^\s*versionCode\b/gm)].length > 1
      || [...clean.matchAll(/^\s*versionName\b/gm)].length > 1
      || [...clean.matchAll(/^\s*targetSdk(?:Version)?\b/gm)].length > 1) {
      diagnostics.push({
        ruleId: "system/analysis", severity: "warning", file: gradle ?? manifestFile,
        message: "Gradle variants or version overrides detected; only literal defaults are inspected.",
        fix: "Verify the final release variant in Gradle; this tool does not evaluate build scripts.",
        policyUrl: "https://developer.android.com/build/build-variants",
      });
    }
    const flutter = /\bflutter\.version(?:Code|Name)\b/.test(clean)
      ? await flutterVersion(root, resolve(root, dirname(gradle ?? manifestFile))) : undefined;
    const flutterCode = /\bversionCode\s*=?\s*\(?\s*flutter\.versionCode\b/.test(clean) && flutter?.build
      ? Number(flutter.build) : undefined;
    const flutterName = /\bversionName\s*=?\s*\(?\s*flutter\.versionName\b/.test(clean) ? flutter?.name : undefined;
    const app: AndroidApp = {
      file: gradle ?? manifestFile, manifestFile, manifest,
      ...(!/\btargetSdk(?:Version)?\b/.test(clean) && Number.isInteger(sdk) && sdk > 0 && { targetSdk: sdk }),
      ...(!/\bversionCode\b/.test(clean) && Number.isInteger(code) && code > 0 && { versionCode: code }),
      ...(!/\bversionName\b/.test(clean) && string(manifest["android:versionName"]) !== undefined
        && { versionName: string(manifest["android:versionName"])! }),
      ...parsed,
      ...(flutterCode !== undefined && Number.isInteger(flutterCode) && { versionCode: flutterCode }),
      ...(flutterName !== undefined && { versionName: flutterName }),
      ...(previousVersionCode !== undefined && { previousVersionCode }),
    };
    const unresolved = [
      app.targetSdk === undefined && "targetSdk",
      app.versionCode === undefined && "versionCode",
      app.versionName === undefined && "versionName",
    ].filter(Boolean);
    if (unresolved.length) {
      diagnostics.push({
        ruleId: "system/analysis", severity: "warning", file: app.file,
        message: `Cannot statically resolve ${unresolved.join(", ")} (set by build logic such as a Flutter or version-catalog value); related checks were skipped.`,
        fix: "Verify these values in the built release variant, or use literal values in Gradle.",
        policyUrl: "https://developer.android.com/build",
      });
    }
    apps.push(app);
  }
  return apps;
}
