import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { releaseVersionSchema } from "./versions.ts";

const ruleSetting = z.union([
  z.enum(["off", "error", "warning", "note"]),
  z.strictObject({ severity: z.enum(["off", "error", "warning", "note"]) }),
]);

export const configSchema = z.strictObject({
  defaultLocale: z.string().min(1).default("en-US"),
  androidDevice: z.enum(["phone", "wear", "automotive", "tv", "xr"]).default("phone"),
  configuration: z.string().min(1).default("Release"),
  iosSdkVersion: releaseVersionSchema.optional(),
  xcodeVersion: releaseVersionSchema.optional(),
  metadata: z.strictObject({
    ios: z.string().min(1).optional(),
    android: z.string().min(1).optional(),
  }).default({}),
  screenshots: z.strictObject({
    ios: z.string().min(1).optional(),
  }).default({}),
  previousAndroidVersionCode: z.number().int().positive().max(2100000000).optional(),
  baselineTag: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).optional(),
  plugins: z.array(z.string().min(1)).default([]),
  rules: z.record(z.string(), ruleSetting).default({}),
});

export type Config = z.infer<typeof configSchema>;

export async function loadConfig(root: string, explicitPath?: string): Promise<Config> {
  const file = resolve(root, explicitPath ?? "shipcheck.config.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (!explicitPath && isMissing(error)) return configSchema.parse({});
    throw new Error(`Cannot read config ${file}`, { cause: error });
  }
  try {
    return configSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new Error(`Invalid config ${file}: ${errorMessage(error)}`, { cause: error });
  }
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
