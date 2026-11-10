import { relative, resolve } from "node:path";
import type { JsonObject } from "../types.ts";
import { array, object, portable, reference, unquote } from "./helpers.ts";

export function targetSources(
  root: string, projectRoot: string, objects: JsonObject, targetId: string, files: readonly string[],
): string[] {
  const section = (name: string): JsonObject => object(objects[name]);
  const groups = {
    ...section("PBXGroup"), ...section("PBXVariantGroup"), ...section("PBXFileSystemSynchronizedRootGroup"),
  };
  const references = { ...section("PBXFileReference"), ...groups };
  const parents = new Map<string, string>();
  for (const [id, value] of Object.entries(groups)) {
    if (typeof value !== "object") continue;
    for (const child of array(object(value).children)) parents.set(reference(child), id);
  }
  const paths = new Map<string, string | undefined>();
  function path(id: string, seen = new Set<string>()): string | undefined {
    if (paths.has(id)) return paths.get(id);
    if (seen.has(id)) return undefined;
    seen.add(id);
    const entry = object(references[id]);
    const tree = unquote(entry.sourceTree) ?? "<group>";
    const value = unquote(entry.path) ?? "";
    if (/\$[({]/.test(value)) return undefined;
    let base: string | undefined;
    if (tree === "SOURCE_ROOT") base = projectRoot;
    else if (tree === "<absolute>") base = "/";
    else if (tree === "<group>") base = parents.has(id) ? path(parents.get(id)!, seen) : projectRoot;
    const result = base === undefined ? undefined : resolve(base, value);
    paths.set(id, result);
    return result;
  }
  const target = object(section("PBXNativeTarget")[targetId]);
  const result = new Set<string>();
  const sourceFiles = files.filter((file) => /\.(?:swift|m|mm|h)$/.test(file));
  const add = (absolute: string | undefined): void => {
    if (absolute === undefined) return;
    const file = portable(relative(root, absolute));
    if (sourceFiles.includes(file)) result.add(file);
  };
  for (const phase of array(target.buildPhases)) {
    const sources = object(section("PBXSourcesBuildPhase")[reference(phase)]);
    for (const entry of array(sources.files)) {
      const buildFile = object(section("PBXBuildFile")[reference(entry)]);
      add(path(reference(buildFile.fileRef)));
    }
  }
  const synchronized = new Set(array(target.fileSystemSynchronizedGroups).map(reference));
  for (const [id, value] of Object.entries(section("PBXFileSystemSynchronizedRootGroup"))) {
    if (typeof value !== "object") continue;
    const directory = path(id);
    if (!directory) continue;
    const exceptions = array(object(value).exceptions)
      .map((entry) => object(section("PBXFileSystemSynchronizedBuildFileExceptionSet")[reference(entry)]))
      .filter((entry) => reference(entry.target) === targetId)
      .flatMap((entry) => array(entry.membershipExceptions).map((item) => unquote(item) ?? ""));
    for (const file of sourceFiles) {
      const local = portable(relative(directory, resolve(root, file)));
      if (local.startsWith("../") || local === "..") continue;
      const exception = exceptions.some((entry) => local === entry || local.startsWith(`${entry}/`));
      if (synchronized.has(id) ? !exception : exception) result.add(file);
    }
  }
  return [...result].sort();
}
