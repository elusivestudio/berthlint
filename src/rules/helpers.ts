import type { Location, ProjectModel, Rule, SourceFile } from "../types.ts";

export function defineRule(rule: Rule): Rule {
  return rule;
}

export function sourceMatches(
  model: ProjectModel, platform: SourceFile["platform"], pattern: RegExp,
): (Location & { message: string })[] {
  return model.sources.filter((source) => source.platform === platform).flatMap((source) => {
    const matches: (Location & { message: string })[] = [];
    for (const match of source.text.matchAll(new RegExp(pattern.source, "gm"))) {
      matches.push({
        file: source.file,
        line: source.text.slice(0, match.index).split("\n").length,
        message: match[0],
      });
    }

    return matches;
  });
}

export function deprecatedMatches(
  model: ProjectModel, platform: SourceFile["platform"], pattern: RegExp,
): (Location & { message: string })[] {
  const seen = new Set<string>();
  return sourceMatches(model, platform, pattern).filter((match) => {
    const source = model.sources.find((source) => source.file === match.file && source.platform === platform)!;
    const line = source.text.split("\n")[(match.line ?? 1) - 1] ?? "";
    if (/^\s*(?:import\b|@import\b|#\s*(?:import|include)\b)/.test(line)) return false;
    const key = `${match.file}\0${match.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
