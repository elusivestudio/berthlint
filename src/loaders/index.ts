import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Config } from "../config.ts";
import type { Finding, Platform, ProjectModel, SourceFile } from "../types.ts";
import { loadIos } from "./ios.ts";
import { loadAndroid } from "./android.ts";
import { loadMetadata } from "./metadata.ts";
import { mapLimit, stripComments, tryReadPlist, walk } from "./helpers.ts";

export async function loadProject(
  rootPath: string, config: Config, options: { platform?: Platform } = {},
): Promise<ProjectModel> {
  const root = resolve(rootPath);
  if (!(await stat(root)).isDirectory()) throw new Error(`Not a project directory: ${root}`);
  const files = await walk(root);
  const diagnostics: Finding[] = [];
  const iosEnabled = options.platform !== "android";
  const androidEnabled = options.platform !== "ios";
  const excludedIosSources = new Set<string>();
  const [ios, android, locales, privacy, sources] = await Promise.all([
    iosEnabled ? loadIos(root, files, config, diagnostics, excludedIosSources) : [],
    androidEnabled ? loadAndroid(root, files, config, diagnostics) : [],
    loadMetadata(root, config, diagnostics, options.platform),
    mapLimit(files.filter((file) => iosEnabled && file.endsWith("PrivacyInfo.xcprivacy")), 32,
      async (file) => ({ file, data: await tryReadPlist(resolve(root, file), file, diagnostics) }))
      .then((items) => items.flatMap(({ file, data }) => data ? [{ file, data }] : [])),
    mapLimit(files.filter((file) => (iosEnabled && /\.(?:swift|m|mm|h)$/.test(file))
      || (androidEnabled && /\.(?:kt|java)$/.test(file))), 32,
      async (file): Promise<SourceFile> => ({
        file, platform: /\.(?:kt|java)$/.test(file) ? "android" : "ios",
        text: stripComments(await readFile(resolve(root, file), "utf8")),
      })),
  ]);
  if (ios.length === 0 && android.length === 0 && locales.length === 0) {
    throw new Error("No supported native app or fastlane metadata found. See --help for supported layouts.");
  }
  for (const platform of ["ios", "android"] as const) {
    const apps = platform === "ios" ? ios : android;
    if (apps.length && !locales.some((locale) => locale.platform === platform)) {
      diagnostics.push({
        ruleId: "system/analysis", severity: "warning", file: ".",
        message: `No ${platform} store metadata found; store listing checks were not run.`,
        fix: `Add fastlane metadata or set metadata.${platform} in berthlint.config.json.`,
        policyUrl: "https://docs.fastlane.tools/",
      });
    }
  }
  return {
    root, ios, android, locales, privacy,
    sources: sources.filter((source) => source.platform !== "ios" || !excludedIosSources.has(source.file)),
    diagnostics,
  };
}
