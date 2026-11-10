import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config.ts";
import { builtInRules } from "../src/rules/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

describe("generated rule reference", () => {
  it("links every rule from the index and provides explanations, fixes, policy and valid configuration", async () => {
    const index = await readFile(resolve(root, "docs/index.html"), "utf8");
    await Promise.all(builtInRules.map(async (rule) => {
      expect(index).toContain(`href="rules/${rule.id}.html"`);
      const file = resolve(root, `docs/rules/${rule.id}.html`);
      const page = await readFile(file, "utf8");
      for (const section of [
        "Why this matters and what is checked", "How to fix it", "Policy and reference", "Configuration",
      ]) expect(page).toContain(`<h2>${section}</h2>`);
      expect(page).toContain(rule.policyUrl.replaceAll("&", "&amp;"));
      for (const match of page.matchAll(/href="([^"]+)"/g)) {
        const href = match[1]!;
        if (!href.startsWith("https://")) {
          expect(await readFile(resolve(dirname(file), href), "utf8")).toContain("<!doctype html>");
        }
      }
      const example = page.match(/<pre><code>([\s\S]+?)<\/code><\/pre>/)?.[1];
      expect(example).toBeDefined();
      const parsed: unknown = JSON.parse(example!.replaceAll("&quot;", '"'));
      expect(configSchema.parse(parsed).rules[rule.id]).toBe("off");
    }));
  });
});
