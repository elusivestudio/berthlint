import { z } from "zod";

export const releaseVersionSchema = z.string()
  .regex(/^\d{1,3}(?:\.\d{1,3}){0,2}$/, "Use a numeric release version, such as 26.0 (not a beta or build number)")
  .refine((value) => Number(value.split(".")[0]) > 0, "The major version must be positive");

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
