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
