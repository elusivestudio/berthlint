import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config.ts";
import { loadProject } from "../src/loaders/index.ts";
import { targetSources } from "../src/loaders/xcode-sources.ts";
import { runRules } from "../src/engine.ts";
import { builtInRules } from "../src/rules/index.ts";
import type { ProjectModel } from "../src/types.ts";
import { config, context, ios, locale, model, put, tempProject } from "./helpers.ts";

const check = (id: string, project: ProjectModel) => builtInRules.find((rule) => rule.id === id)!.check(project, context);
const source = (file: string, text: string) => ({ file, text, platform: "ios" as const });

describe("real-project iOS regressions", () => {
  it("only attributes permission use to targets with source membership", () => {
    const project = model({
      ios: [
        ios({ name: "App", sourceFiles: ["App/Camera.swift"] }),
        ios({ name: "Widget", file: "Widget/Info.plist", sourceFiles: ["Widget/Timeline.swift"] }),
      ],
      sources: [source("App/Camera.swift", "AVCaptureDevice()")],
    });
    expect(check("ios/usage-descriptions", project)).toMatchObject([
      { file: "App/Info.plist", message: expect.stringContaining("App is missing NSCameraUsageDescription") },
    ]);
  });
  it("reports unmapped package ownership once, not as missing strings on every extension", () => {
    const project = model({
      ios: [ios({ sourceFiles: [] }), ios({ name: "Widget", sourceFiles: [] })],
      sources: [source("Packages/Camera.swift", "AVCaptureDevice()")],
    });
    expect(check("ios/usage-descriptions", project)).toMatchObject([
      { file: "Packages/Camera.swift", message: expect.stringContaining("target ownership is unknown") },
    ]);
  });
  it("keeps standalone plist heuristic checks and valid owned descriptions", () => {
    const project = model({
      ios: [ios({ sourceFiles: ["Camera.swift"], info: { NSCameraUsageDescription: "Scan codes" } })],
      sources: [source("Camera.swift", "AVCaptureDevice()")],
    });
    expect(check("ios/usage-descriptions", project)).toEqual([]);
    expect(check("ios/usage-descriptions", model({
      ios: [ios()], sources: project.sources,
    }))).toHaveLength(1);
  });
  it("does not compare missing or unresolved versions against a resolved sibling", () => {
    const missing = ios();
    delete missing.version;
    delete missing.build;
    const targets = [
      ios({ version: "$(MARKETING_VERSION)", build: "$(CURRENT_PROJECT_VERSION)" }),
      ios({ version: "${MARKETING_VERSION}", build: "${CURRENT_PROJECT_VERSION}" }),
      missing,
      ios({ name: "Resolved", version: "2026.8.0", build: "2026" }),
    ];
    expect(check("ios/version-consistency", model({ ios: targets }))).toEqual([]);
    expect(check("ios/version-format", model({ ios: targets.slice(0, 2) }))).toEqual([]);
    expect(check("ios/version-consistency", model({
      ios: [...targets, ios({ name: "Mismatch", build: "999" })],
    }))).toHaveLength(2);
  });
  it.each([
    "SDKROOT = watchos;",
    'SDKROOT = auto; SUPPORTED_PLATFORMS = "watchos watchsimulator";',
    "WATCHOS_DEPLOYMENT_TARGET = 10.0;",
    "SDKROOT = appletvos;",
    "SDKROOT = xros;",
    "SDKROOT = macosx;",
  ])("excludes non-iOS project targets: %s", async (settings) => {
    const root = await tempProject();
    const fixture = fileURLToPath(new URL("./fixtures/xcode/App.xcodeproj/project.pbxproj", import.meta.url));
    const pbx = await readFile(fixture, "utf8");
    await put(root, "App.xcodeproj/project.pbxproj", pbx);
    await put(root, "Other.xcodeproj/project.pbxproj", pbx.replace("GENERATE_INFOPLIST_FILE = YES;",
      `GENERATE_INFOPLIST_FILE = YES; ${settings}`));
    const project = await loadProject(root, config);
    expect(project.ios).toHaveLength(1);
    expect(project.ios[0]?.project).toBe("App.xcodeproj/project.pbxproj");
  });
  it("summarizes repeated deployment coverage while retaining every affected target", () => {
    const findings = check("ios/deployment-target-coverage", model({
      ios: [ios({ project: "App.xcodeproj", name: "App" }), ios({ project: "App.xcodeproj", name: "Widget" })],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("2 target(s): App, Widget");
  });
  it.each([
    'SDKROOT = "$(RELEASE_SDK)";',
    'SUPPORTED_PLATFORMS = "$(AVAILABLE_PLATFORMS)";',
    'SUPPORTED_PLATFORMS = "iphoneos macosx";',
  ])("does not exclude potentially iOS targets with unknown or mixed platforms: %s", async (settings) => {
    const root = await tempProject();
    const fixture = fileURLToPath(new URL("./fixtures/xcode/App.xcodeproj/project.pbxproj", import.meta.url));
    const pbx = await readFile(fixture, "utf8");
    await put(root, "App.xcodeproj/project.pbxproj", pbx.replace("GENERATE_INFOPLIST_FILE = YES;",
      `GENERATE_INFOPLIST_FILE = YES; ${settings}`));
    expect((await loadProject(root, config)).ios).toHaveLength(1);
  });
  it("removes sources owned only by test or Watch targets, retaining shared app sources", async () => {
    const root = await tempProject();
    const fixture = fileURLToPath(new URL("./fixtures/xcode/App.xcodeproj/project.pbxproj", import.meta.url));
    const pbx = await readFile(fixture, "utf8");
    const withSource = (file: string) => pbx.replace("objects = {", `objects = {
      /* Begin PBXFileReference section */
      B00000000000000000000001 = { isa = PBXFileReference; path = "${file}"; sourceTree = SOURCE_ROOT; };
      /* End PBXFileReference section */
      /* Begin PBXBuildFile section */
      B00000000000000000000002 = { isa = PBXBuildFile; fileRef = B00000000000000000000001; };
      /* End PBXBuildFile section */
      /* Begin PBXSourcesBuildPhase section */
      B00000000000000000000003 = { isa = PBXSourcesBuildPhase; files = (B00000000000000000000002,); };
      /* End PBXSourcesBuildPhase section */`)
      .replace("name = Fixture;", "name = Fixture; buildPhases = (B00000000000000000000003,);");
    await put(root, "App.xcodeproj/project.pbxproj", withSource("Shared.swift"));
    await put(root, "Watch.xcodeproj/project.pbxproj", withSource("Watch.swift")
      .replace("GENERATE_INFOPLIST_FILE = YES;", "GENERATE_INFOPLIST_FILE = YES; SDKROOT = watchos;"));
    await put(root, "Tests.xcodeproj/project.pbxproj", withSource("Test.swift")
      .replace("com.apple.product-type.application", "com.apple.product-type.bundle.unit-test"));
    await put(root, "SharedWatch.xcodeproj/project.pbxproj", withSource("Shared.swift")
      .replace("GENERATE_INFOPLIST_FILE = YES;", "GENERATE_INFOPLIST_FILE = YES; SDKROOT = watchos;"));
    for (const file of ["Shared.swift", "Watch.swift", "Test.swift"]) await put(root, file, "AVCaptureDevice()");
    const project = await loadProject(root, config);
    expect(project.ios).toHaveLength(1);
    expect(project.sources.map((source) => source.file)).toEqual(["Shared.swift"]);
    expect(project.ios[0]?.sourceFiles).toEqual(["Shared.swift"]);
  });
});

describe("Xcode source membership", () => {
  it("resolves nested group paths and explicit Sources build phases", () => {
    const objects = {
      PBXGroup: { root: { children: ["app"] }, app: { path: "App", children: ["camera"] } },
      PBXFileReference: { camera: { path: "Camera.swift", sourceTree: '"<group>"' } },
      PBXBuildFile: { cameraBuild: { fileRef: "camera" } },
      PBXSourcesBuildPhase: { sources: { files: [{ value: "cameraBuild" }] } },
      PBXNativeTarget: { app: { buildPhases: [{ value: "sources" }] }, widget: {} },
    };
    expect(targetSources("/root", "/root", objects, "app", ["App/Camera.swift"])).toEqual(["App/Camera.swift"]);
    expect(targetSources("/root", "/root", objects, "widget", ["App/Camera.swift"])).toEqual([]);
  });
  it("respects synchronized membership exceptions for members and nonmember targets", () => {
    const objects = {
      PBXFileSystemSynchronizedRootGroup: {
        group: { path: "App", exceptions: ["excluded", "included"] },
      },
      PBXFileSystemSynchronizedBuildFileExceptionSet: {
        excluded: { target: "app", membershipExceptions: ["Excluded.swift"] },
        included: { target: "widget", membershipExceptions: ["Shared.swift"] },
      },
      PBXNativeTarget: { app: { fileSystemSynchronizedGroups: ["group"] }, widget: {} },
    };
    const files = ["App/Camera.swift", "App/Excluded.swift", "App/Shared.swift", "Unrelated.swift"];
    expect(targetSources("/root", "/root", objects, "app", files)).toEqual(["App/Camera.swift", "App/Shared.swift"]);
    expect(targetSources("/root", "/root", objects, "widget", files)).toEqual(["App/Shared.swift"]);
  });
  it("does not guess paths with unresolved variables or cyclic groups", () => {
    const objects = {
      PBXGroup: { a: { path: "$(UNKNOWN)", children: ["b"] }, b: { children: ["a"] } },
      PBXFileReference: { file: { path: "Camera.swift", sourceTree: "SDKROOT" } },
      PBXBuildFile: { build: { fileRef: "file" } },
      PBXSourcesBuildPhase: { sources: { files: ["build"] } },
      PBXNativeTarget: { app: { buildPhases: ["sources"] } },
    };
    expect(targetSources("/root", "/root", objects, "app", ["Camera.swift"])).toEqual([]);
  });
});

describe("metadata and API noise regressions", () => {
  it("aggregates absent fields and screenshots without duplicate localization errors", () => {
    const project = model({
      locales: [locale(), ...["fr-FR", "de-DE"].map((name) =>
        locale({ locale: name, directory: `fastlane/metadata/${name}`, fields: {}, screenshots: [] }))],
    });
    const report = runRules(project, builtInRules, config, { now: context.now });
    expect(report.summary.error).toBe(0);
    expect(report.findings).toHaveLength(4);
    expect(report.findings.every((finding) => finding.ruleId === "metadata/completeness")).toBe(true);
    expect(report.findings.every((finding) => finding.message.includes("fr-FR, de-DE"))).toBe(true);
    expect(runRules(project, builtInRules, configSchema.parse({
      rules: { "metadata/completeness": "error" },
    }), { now: context.now }).summary.error).toBe(4);
  });
  it("keeps blank required values and actual byte-limit violations as errors", () => {
    const report = runRules(model({ locales: [locale({
      fields: {
        name: { file: "name.txt", value: " " },
        keywords: { file: "keywords.txt", value: "é".repeat(51) },
      },
    })] }), builtInRules, config, { now: context.now });
    expect(report.findings.filter((finding) => finding.severity === "error").map((finding) => finding.ruleId).sort())
      .toEqual(["metadata/lengths", "metadata/required-fields"]);
  });
  it("reports optional-field parity separately from required-field absence", () => {
    expect(check("metadata/localizations", model({ locales: [
      locale({ fields: { ...locale().fields, subtitle: { file: "subtitle.txt", value: "Release" } } }),
      locale({ locale: "fr-FR", fields: {} }),
    ] }))).toHaveLength(1);
  });
  it("ignores import-only deprecated tokens and emits one warning per API and source file", () => {
    const report = check("android/deprecated-apis", model({ sources: [{
      file: "App.kt", platform: "android",
      text: "import android.os.AsyncTask\nclass Task : AsyncTask() {}\nAsyncTask.execute()\nstartActivityForResult()\nstartActivityForResult()",
    }] }));
    expect(report).toMatchObject([{ line: 2 }, { line: 4 }]);
    expect(check("android/deprecated-apis", model({ sources: [{
      file: "Unused.kt", platform: "android", text: "import android.os.AsyncTask",
    }] }))).toEqual([]);
  });
});
