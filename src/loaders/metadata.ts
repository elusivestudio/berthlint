import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { imageSize } from "image-size";
import { isMissing } from "../config.ts";
import type { Config } from "../config.ts";
import type { Finding, MetadataField, Platform, Screenshot, StoreLocale } from "../types.ts";
import { requirements, iosScreenshotGroup } from "../requirements.ts";
import { portable, walk } from "./helpers.ts";

async function existsDirectory(path: string, explicit: boolean): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) throw new Error(`Not a metadata/screenshots directory: ${path}`);
    return true;
  } catch (error) {
    if (!explicit && isMissing(error)) return false;
    throw error;
  }
}

async function localeNames(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(entry.name))
    .map((entry) => entry.name).sort();
}

export async function loadMetadata(
  root: string, config: Config, diagnostics: Finding[], selected: Platform = "all",
): Promise<StoreLocale[]> {
  const locales: StoreLocale[] = [];
  for (const platform of ["ios", "android"] as const) {
    if (selected !== "all" && selected !== platform) continue;
    const explicit = config.metadata[platform];
    const candidates = explicit ? [explicit] : platform === "ios"
      ? ["fastlane/metadata", "ios/fastlane/metadata"]
      : ["fastlane/metadata/android", "android/fastlane/metadata/android"];
    for (const candidate of candidates) {
      const directory = resolve(root, candidate);
      const metadataExists = await existsDirectory(directory, explicit !== undefined);
      const shotDirectory = resolve(root, config.screenshots.ios ?? resolve(directory, "..", "screenshots"));
      const shotsExist = platform === "ios"
        && await existsDirectory(shotDirectory, config.screenshots.ios !== undefined);
      if (!metadataExists && !shotsExist) continue;
      const [files, shotFiles, metadataNames, shotNames] = await Promise.all([
        metadataExists ? walk(directory) : [],
        shotsExist ? walk(shotDirectory) : [],
        metadataExists ? localeNames(directory) : [],
        shotsExist ? localeNames(shotDirectory) : [],
      ]);
      const names = [...new Set([...metadataNames, ...shotNames])].sort();
      for (const locale of names) {
        const localeFiles = files.filter((file) => file.startsWith(`${locale}/`));
        const fields: Record<string, MetadataField> = {};
        for (const field of Object.keys(requirements.metadata[platform])) {
          const path = `${locale}/${field}.txt`;
          if (!localeFiles.includes(path)) continue;
          fields[field] = {
            file: portable(relative(root, resolve(directory, path))),
            value: (await readFile(resolve(directory, path), "utf8"))
              .replace(/^\uFEFF/, "").replace(/\r?\n$/, ""),
          };
        }
        const screenshots: Screenshot[] = [];
        const shots = [
          ...localeFiles.filter((file) => /\.(?:png|jpe?g)$/i.test(file)
            && (platform === "ios" ? file.includes("/screenshots/") : /\/images\/[^/]*Screenshots\//.test(file)))
            .map((path) => resolve(directory, path)),
          ...shotFiles.filter((file) => file.startsWith(`${locale}/`) && /\.(?:png|jpe?g)$/i.test(file))
            .map((path) => resolve(shotDirectory, path)),
        ];
        for (const absolute of new Set(shots)) {
          const { width, height, type } = imageSize(await readFile(absolute));
          if (!["png", "jpg"].includes(type ?? "") || !width || !height) {
            throw new Error(`Unsupported screenshot format: ${absolute}; use PNG or JPEG`);
          }
          screenshots.push({
            file: portable(relative(root, absolute)), width, height,
            group: platform === "ios" ? iosScreenshotGroup(width, height) ?? "unknown"
              : basename(resolve(absolute, "..")),
          });
        }
        locales.push({
          platform, locale, directory: portable(relative(root, resolve(directory, locale))),
          fields, screenshots,
        });
      }
      if (explicit && names.length === 0) {
        diagnostics.push({
          ruleId: "system/analysis", severity: "warning", file: portable(relative(root, directory)) || ".",
          message: "No locale folders found in the configured metadata directory.",
          fix: "Add fastlane locale folders, such as en-US/name.txt (iOS) or en-US/title.txt (Android).",
          policyUrl: "https://docs.fastlane.tools/",
        });
      }
    }
  }
  return locales;
}
