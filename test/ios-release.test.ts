import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config.ts";
import { runRules } from "../src/engine.ts";
import { requirements } from "../src/requirements.ts";
import { iosReleaseRules } from "../src/rules/ios-release.ts";
import type { ProjectModel, RuleContext } from "../src/types.ts";
import { android, context, ios, model } from "./helpers.ts";

function check(id: string, project: ProjectModel, overrides: Partial<RuleContext> = {}) {
  const rule = iosReleaseRules.find((candidate) => candidate.id === `ios/${id}`);
  if (!rule) throw new Error(`Unknown iOS release rule: ${id}`);
  return rule.check(project, { ...context, ...overrides });
}

describe("iOS SDK requirements", () => {
  const project = model({ ios: [ios()] });
  it("accepts exactly the required SDK and Xcode and later numeric versions", () => {
    for (const [iosSdkVersion, xcodeVersion] of [
      [requirements.iosSubmission.minimumSdk, requirements.iosSubmission.minimumXcode],
      ["99.0", "99.0"],
    ] as const) {
      expect(check("sdk-requirements", project, { iosSdkVersion, xcodeVersion })).toEqual([]);
    }
  });
  it("reports each outdated declared value and does not infer Xcode from SDK", () => {
    expect(check("sdk-requirements", project, { iosSdkVersion: "18.5", xcodeVersion: "16.4" })).toHaveLength(2);
    expect(check("sdk-requirements", project, { iosSdkVersion: "18.5" })).toHaveLength(1);
    expect(check("sdk-requirements", project, { xcodeVersion: "16.4" })).toHaveLength(1);
  });
  it("applies the requirement at its exact effective date, not before", () => {
    const effective = Date.parse(requirements.iosSubmission.effectiveOn);
    expect(check("sdk-requirements", project, {
      iosSdkVersion: "18.5", now: new Date(effective - 1),
    })).toEqual([]);
    expect(check("sdk-requirements", project, {
      iosSdkVersion: "18.5", now: new Date(effective),
    })).toHaveLength(1);
  });
  it("reports missing SDK as a nonblocking coverage note only for native iOS apps", () => {
    expect(check("sdk-coverage", project)).toHaveLength(1);
    expect(check("sdk-coverage", project, { iosSdkVersion: "26.0" })).toEqual([]);
    for (const input of [model(), model({ android: [android()] })]) {
      for (const rule of iosReleaseRules) expect(rule.check(input, context)).toEqual([]);
    }
    const report = runRules(project, iosReleaseRules, configSchema.parse({}), { now: context.now });
    expect(report.summary.error).toBe(0);
    expect(report.summary.warning).toBe(0);
    expect(report.findings.find((finding) => finding.ruleId === "ios/sdk-coverage")?.severity).toBe("note");
  });
  it("passes SDK declarations from config to rules, respecting severity and platform filtering", () => {
    const configured = configSchema.parse({
      iosSdkVersion: "18.5", xcodeVersion: "16.4", rules: { "ios/sdk-requirements": "warning" },
    });
    expect(runRules(project, iosReleaseRules, configured, { now: context.now }).summary.warning).toBe(2);
    expect(runRules(model({ ios: [ios()], android: [android()] }), iosReleaseRules, configured, {
      now: context.now, platform: "android",
    }).findings).toEqual([]);
  });
});

describe("iOS deployment targets", () => {
  const project = (deploymentTarget?: string) => model({
    ios: [ios({ ...(deploymentTarget !== undefined && { deploymentTarget }), project: "App.xcodeproj/project.pbxproj" })],
  });
  it("keeps a valid deployment target distinct from the newer SDK minimum", () => {
    expect(check("deployment-target", project("15.0"), { iosSdkVersion: "26.0", xcodeVersion: "26.0" })).toEqual([]);
    expect(check("deployment-target", project("26"), { iosSdkVersion: "26.0" })).toEqual([]);
  });
  it("rejects a deployment target above the declared SDK using numeric comparison", () => {
    expect(check("deployment-target", project("26.10"), { iosSdkVersion: "26.9" })).toMatchObject([
      { file: "App.xcodeproj/project.pbxproj", message: expect.stringContaining("exceeds declared iOS SDK") },
    ]);
  });
  it("only enforces a documented Xcode family's deployment support floor", () => {
    expect(check("deployment-target", project("14.9"), { xcodeVersion: "26.1" })).toHaveLength(1);
    expect(check("deployment-target", project("15"), { xcodeVersion: "26.1" })).toEqual([]);
    expect(check("deployment-target", project("14.9"), { xcodeVersion: "99" })).toEqual([]);
    expect(check("deployment-target", project("14.9"))).toEqual([]);
    expect(check("deployment-target", project("15.0"), { xcodeVersion: "27.2" })).toEqual([]);
  });
  it("applies the distinct App Store deployment minimum at its effective date", () => {
    const effective = Date.parse(requirements.iosDeployment.effectiveOn);
    expect(check("deployment-target", project("12.9"), { now: new Date(effective - 1) })).toEqual([]);
    expect(check("deployment-target", project("12.9"), { now: new Date(effective) })).toMatchObject([
      { policyUrl: requirements.sources.iosDeployment },
    ]);
    expect(check("deployment-target", project("13.0"))).toEqual([]);
  });
  it.each(["", "latest", "0", "15.x", "-15", "15.0.0.0"])("flags invalid resolved target %j", (target) => {
    expect(check("deployment-target", project(target))).toHaveLength(1);
  });
  it.each([undefined, "$(MIN_IOS)", "${MIN_IOS}"])("reports missing/unresolved target %j as coverage, not an invalid number", (target) => {
    expect(check("deployment-target", project(target), { iosSdkVersion: "26" })).toEqual([]);
    expect(check("deployment-target-coverage", project(target))).toHaveLength(1);
  });
  it("does not claim undocumented compatibility checks were performed", () => {
    expect(check("deployment-target-coverage", project("15.0"))).toHaveLength(1);
    expect(check("deployment-target-coverage", project("15.0"), { xcodeVersion: "99" })).toHaveLength(1);
    expect(check("deployment-target-coverage", project("15.0"), { xcodeVersion: "26.0" })).toEqual([]);
  });
});
