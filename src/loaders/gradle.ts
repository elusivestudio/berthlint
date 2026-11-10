import { stripComments } from "./helpers.ts";

export interface GradleInputs {
  versionCatalog?: string;
  gradleProperties?: string;
}

interface GradleValues {
  targetSdk?: number;
  versionCode?: number;
  versionName?: string;
}

function stripTomlComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== "\\") quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

function validInlineTable(value: string): boolean {
  if (!value.startsWith("{") || !value.endsWith("}")) return false;
  const body = value.slice(1, -1).trim();
  if (!body) return false;
  const fields: string[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (quote) {
      if (character === quote && body[index - 1] !== "\\") quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{" || character === "[") {
      depth++;
    } else if (character === "}" || character === "]") {
      depth--;
      if (depth < 0) return false;
    } else if (character === "," && depth === 0) {
      fields.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || depth !== 0) return false;
  fields.push(body.slice(start).trim());
  return fields.every((field) => /^[A-Za-z0-9_.-]+\s*=\s*\S[\s\S]*$/.test(field));
}

function tomlEntries(text: string | undefined, wantedSection: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!text) return entries;
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    const header = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (header?.[1]) {
      section = header[1];
      continue;
    }
    if (section !== wantedSection) continue;
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!entry?.[1] || !entry[2]) {
      if (line) throw new Error(`Unsupported or malformed Gradle version catalog entry in [${section}]: ${line}`);
      continue;
    }
    if (entries.has(entry[1])) {
      throw new Error(`Duplicate Gradle version catalog key '${entry[1]}' in [${section}]`);
    }
    const value = entry[2].trim();
    const validValue = wantedSection === "versions"
      ? quoted(value) !== undefined || validInlineTable(value) : validInlineTable(value);
    if (!validValue) {
      throw new Error(`Unsupported or malformed Gradle version catalog value for '${entry[1]}' in [${section}]`);
    }
    entries.set(entry[1], value);
  }
  return entries;
}

function quoted(value: string | undefined): string | undefined {
  const match = value?.match(/^(?:"([^"\\]*)"|'([^'\\]*)')$/);
  return match ? match[1] ?? match[2] : undefined;
}

function catalogVersion(inputs: GradleInputs, accessor: string): string | undefined {
  const key = accessor.split(".").join("-");
  return quoted(tomlEntries(inputs.versionCatalog, "versions").get(key));
}

function catalogPluginId(inputs: GradleInputs, accessor: string): string | undefined {
  const entry = tomlEntries(inputs.versionCatalog, "plugins").get(accessor.split(".").join("-"));
  const id = entry?.match(/\bid\s*=\s*(?:"([^"\\]*)"|'([^'\\]*)')/);
  return id?.[1] ?? id?.[2];
}

function gradleProperty(inputs: GradleInputs, key: string): string | undefined {
  if (!inputs.gradleProperties) return undefined;
  for (const rawLine of inputs.gradleProperties.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const match = line.match(/^([^:=\s]+)\s*[=:]\s*(.*?)\s*$/);
    if (match?.[1] === key) return match[2];
  }
  return undefined;
}

function evaluateExpression(
  expression: string, kind: "number" | "string", inputs: GradleInputs,
  variables: ReadonlyMap<string, string | number>,
): string | number | undefined {
  const value = expression.trim();
  if (kind === "number" && /^\d+$/.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : undefined;
  }
  if (kind === "string") {
    const literal = quoted(value);
    if (literal !== undefined) return literal;
  }
  const variable = variables.get(value);
  if (variable !== undefined && (kind === "string" || typeof variable === "number")) return variable;
  const catalog = value.match(/^(?:project\.)?libs\.versions\.([A-Za-z0-9_.-]+)\.get\(\)(\.toInt\(\))?$/);
  if (catalog?.[1]) {
    const version = catalogVersion(inputs, catalog[1]);
    if (version === undefined) return undefined;
    if (catalog[2]) {
      if (!/^[+-]?\d+$/.test(version)) return undefined;
      const number = Number(version);
      return Number.isSafeInteger(number) ? number : undefined;
    }
    return kind === "string" ? version : undefined;
  }
  const property = value.match(/^(?:rootProject\.)?project\.property\((?:"([^"\\]+)"|'([^'\\]+)')\)\.toString\(\)(\.toInt\(\))?$/);
  if (property) {
    const key = property[1] ?? property[2];
    if (!key) return undefined;
    const propertyValue = gradleProperty(inputs, key);
    if (propertyValue === undefined) return undefined;
    if (property[3]) {
      if (!/^[+-]?\d+$/.test(propertyValue)) return undefined;
      const number = Number(propertyValue);
      return Number.isSafeInteger(number) ? number : undefined;
    }
    return kind === "string" ? propertyValue : undefined;
  }
  return undefined;
}

// Only recognize static shared-value references; never execute Gradle code.
export function resolveGradleValues(text: string, inputs: GradleInputs = {}): GradleValues {
  const clean = stripComments(text);
  const variables = new Map<string, string | number>();
  for (const match of clean.matchAll(/^\s*val\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*;?\s*$/gm)) {
    const name = match[1];
    const expression = match[2];
    if (!name || !expression) continue;
    const value = evaluateExpression(expression, "number", inputs, variables)
      ?? evaluateExpression(expression, "string", inputs, variables);
    if (value !== undefined) variables.set(name, value);
  }
  const result: GradleValues = {};
  const fields = [
    ["targetSdk", /^\s*targetSdk(?:Version)?\s*=\s*(.*?)\s*;?\s*$/gm, "number"],
    ["versionCode", /^\s*versionCode\s*=\s*(.*?)\s*;?\s*$/gm, "number"],
    ["versionName", /^\s*versionName\s*=\s*(.*?)\s*;?\s*$/gm, "string"],
  ] as const;
  for (const [field, pattern, kind] of fields) {
    const matches = [...clean.matchAll(pattern)];
    if (matches.length !== 1) continue;
    const expression = matches[0]?.[1];
    if (!expression) continue;
    const value = evaluateExpression(expression, kind, inputs, variables);
    if (typeof value === kind) Object.assign(result, { [field]: value });
  }
  return result;
}

export function usesAndroidApplicationPlugin(text: string, inputs: GradleInputs = {}): boolean {
  const clean = stripComments(text);
  if (/\bid\s*\(\s*["']com\.android\.application["']\s*\)/.test(clean)) return true;
  for (const match of clean.matchAll(/\balias\s*\(\s*libs\.plugins\.([A-Za-z0-9_.-]+)\s*\)/g)) {
    const accessor = match[1];
    if (accessor && catalogPluginId(inputs, accessor) === "com.android.application") return true;
  }
  return false;
}
