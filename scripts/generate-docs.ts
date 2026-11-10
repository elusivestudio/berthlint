import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { builtInRules } from "../src/rules/index.ts";
import { requirements } from "../src/requirements.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const escape = (text: string): string => text.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function page(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="berthlint rule metadata">
<title>${escape(title)} | berthlint</title>
<style>
:root{color-scheme:light dark;font:17px/1.6 system-ui,sans-serif}
body{max-width:60rem;margin:3rem auto;padding:0 1.25rem}
a{color:light-dark(#064ca0,#8dc4ff)}code,pre{font-family:ui-monospace,monospace}
pre{padding:1rem;background:light-dark(#f2f4f7,#20242b);overflow:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #8886}
footer{margin-top:3rem;border-top:1px solid #8886;padding-top:1rem}h1{line-height:1.2}
</style>
</head>
<body>
<header><strong>berthlint</strong> &mdash; static native mobile release checks</header>
<main>${content}</main>
<footer>Generated from rule metadata. Policy snapshot: ${escape(requirements.verifiedOn)}.
Static checks do not guarantee store acceptance.
<a href="https://github.com/elusivestudio/berthlint">Source and usage</a>.</footer>
</body>
</html>
`;
}

const pages = new Map<string, string>();
const rows = builtInRules.map((rule) =>
  `<tr><td><a href="rules/${escape(rule.id)}.html"><code>${escape(rule.id)}</code></a></td>`
  + `<td>${escape(rule.severity)}</td><td>${escape(rule.title)}</td></tr>`).join("\n");
pages.set("docs/index.html", page("Rule reference", `
<h1>Release checks, explained</h1>
<p>Run <code>berthlint</code> in a native iOS or Android repository to check release settings
and fastlane store metadata without building or uploading.</p>
<p>Each finding includes a fix suggestion and a policy link. SDK and Xcode versions are
user declarations, not proof of the toolchain actually used to build.</p>
<h2>${builtInRules.length} built-in rules</h2>
<table><thead><tr><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col">Check</th></tr></thead>
<tbody>${rows}</tbody></table>
<p><code>system/analysis</code> additionally reports parser limitations and skipped checks.
Configure its severity in the same way as a rule.</p>`));

for (const rule of builtInRules) {
  if (!rule.description) throw new Error(`Missing rule description: ${rule.id}`);
  const config = JSON.stringify({ rules: { [rule.id]: "off" } }, null, 2);
  pages.set(`docs/rules/${rule.id}.html`, page(rule.title, `
<nav><a href="../../index.html">All rules</a></nav>
<h1>${escape(rule.title)}</h1>
<p><code>${escape(rule.id)}</code> &middot; ${escape(rule.platform)} &middot;
default severity: <strong>${escape(rule.severity)}</strong></p>
<h2>Why this matters and what is checked</h2>
<p>${escape(rule.description)}</p>
<h2>How to fix it</h2>
<p>${escape(rule.fix)}</p>
<h2>Policy and reference</h2>
<p><a href="${escape(rule.policyUrl)}">${escape(rule.policyUrl)}</a></p>
<h2>Configuration</h2>
<p>Set a severity of <code>error</code>, <code>warning</code> or <code>note</code>,
or disable the check in <code>berthlint.config.json</code> when it is intentionally inapplicable:</p>
<pre><code>${escape(config)}</code></pre>`));
}

for (const [file, contents] of pages) {
  const path = resolve(root, file);
  if (check) {
    let existing: string;
    try {
      existing = await readFile(path, "utf8");
    } catch (error) {
      throw new Error(`Cannot check generated documentation ${file}; run npm run docs`, { cause: error });
    }
    if (existing !== contents) throw new Error(`Outdated generated documentation: ${file}; run npm run docs`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}

if (check) {
  for (const entry of await readdir(resolve(root, "docs/rules"), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const file = relative(root, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/");
    if (!pages.has(file)) throw new Error(`Unexpected generated rule page: ${file}`);
  }
}
console.log(`${check ? "Verified" : "Generated"} ${pages.size} documentation pages.`);
