import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { errorMessage, isMissing } from "./config.ts";
import type { Finding } from "./types.ts";

const suppressionSchema = z.strictObject({
  ruleId: z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/),
  file: z.string().min(1).refine((file) => file === "." || (
    !/[\\:*?[\]]/.test(file)
    && file.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  ), "Use an exact project-relative path with forward slashes, not a glob"),
  message: z.string().min(1),
  reason: z.string().trim().min(1),
});

export type Suppression = z.infer<typeof suppressionSchema>;

export function suppressionKey(finding: Pick<Finding, "ruleId" | "file" | "message">): string {
  return JSON.stringify([finding.ruleId, finding.file, finding.message]);
}

export const suppressionsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  suppressions: z.array(suppressionSchema),
}).superRefine(({ suppressions }, context) => {
  const seen = new Set<string>();
  for (const [index, entry] of suppressions.entries()) {
    const key = suppressionKey(entry);
    if (seen.has(key)) {
      context.addIssue({ code: "custom", path: ["suppressions", index], message: "Duplicate suppression" });
    }
    seen.add(key);
  }
});

export async function loadSuppressions(root: string, explicitPath?: string): Promise<Suppression[]> {
  const file = resolve(root, explicitPath ?? "berthlint.suppressions.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (explicitPath === undefined && isMissing(error)) return [];
    throw new Error(`Cannot read suppressions ${file}`, { cause: error });
  }
  try {
    return suppressionsSchema.parse(JSON.parse(text)).suppressions;
  } catch (error) {
    throw new Error(`Invalid suppressions ${file}: ${errorMessage(error)}`, { cause: error });
  }
}
