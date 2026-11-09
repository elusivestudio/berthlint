import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "plist";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Finding, JsonObject } from "../types.ts";

export function object(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject : {};
}

export function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function string(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function unquote(value: unknown): string | undefined {
  return string(value)?.replace(/^"(.*)"$/, "$1");
}

export function reference(value: unknown): string {
  return unquote(object(value).value ?? value) ?? "";
}

export function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

export async function mapLimit<T, R>(
  items: readonly T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }));
  return results;
}

const ignoredSuffixes = [".framework", ".xcframework", ".xcassets", ".xcarchive", ".app", ".dSYM"];

const ignored = new Set([
  ".git", "node_modules", "Pods", "Carthage", "build", "dist", "DerivedData",
  ".gradle", ".build", "vendor", ".swiftpm", "coverage",
]);

export async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (entry.isSymbolicLink() || ignored.has(entry.name)
        || (entry.isDirectory() && ignoredSuffixes.some((suffix) => entry.name.endsWith(suffix)))) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(portable(relative(root, path)));
    }
  }
  await visit(root);
  return files;
}

export async function readPlist(path: string): Promise<JsonObject> {
  const raw = await readFile(path);
  if (raw.subarray(0, 6).toString("latin1") === "bplist") {
    throw new Error(`Binary plists are not supported: ${path}; convert with plutil -convert xml1`);
  }
  const data = raw.toString("utf8");
  if (!data.includes("<plist")) throw new Error(`Not an XML plist: ${path}`);
  const parsed: unknown = parse(data);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected a plist dictionary in ${path}`);
  }
  return object(parsed);
}

export async function readManifest(path: string): Promise<JsonObject> {
  const text = await readFile(path, "utf8");
  const valid = XMLValidator.validate(text);
  if (valid !== true) throw new Error(`Invalid XML in ${path}: ${valid.err.msg}`);
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    processEntities: false,
  }).parse(text);
  const manifest = object(object(parsed).manifest);
  if (!Object.keys(manifest).length) throw new Error(`Missing <manifest> in ${path}`);
  return manifest;
}

export function stripComments(text: string): string {
  return text.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match) => match.startsWith("//") || match.startsWith("/*")
      ? match.replace(/[^\n]/g, " ") : match,
  );
}

export async function flutterVersion(
  root: string, from: string,
): Promise<{ name: string; build?: string } | undefined> {
  const top = resolve(root);
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    try {
      const text = await readFile(join(dir, "pubspec.yaml"), "utf8");
      const match = text.match(/^version:\s*([^\s+#]+)(?:\+([^\s#]+))?/m);
      return match?.[1] ? { name: match[1], ...(match[2] && { build: match[2] }) } : undefined;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (dir === top || dirname(dir) === dir) return undefined;
  }
}

export async function tryReadPlist(
  path: string, file: string, diagnostics: Finding[],
): Promise<JsonObject | undefined> {
  try {
    return await readPlist(path);
  } catch (error) {
    diagnostics.push({
      ruleId: "system/analysis", severity: "warning", file,
      message: `Skipped unreadable plist: ${error instanceof Error ? error.message.replace(path, file) : String(error)}`,
      fix: "Convert to an XML plist (plutil -convert xml1) or exclude the directory if it is third-party content.",
      policyUrl: "https://developer.apple.com/documentation/bundleresources/information-property-list",
    });
    return undefined;
  }
}
