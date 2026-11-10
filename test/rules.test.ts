import { describe, expect, it } from "vitest";
import { builtInRules } from "../src/rules/index.ts";
import { runRules } from "../src/engine.ts";
import { configSchema } from "../src/config.ts";
import { iosScreenshotGroup, requirements } from "../src/requirements.ts";
import type { JsonObject, ProjectModel } from "../src/types.ts";
import { android, config, context, ios, locale, model } from "./helpers.ts";

function check(id: string, project: ProjectModel) {
  const rule = builtInRules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Unknown rule ${id}`);
  return rule.check(project, context);
}

const source = (text: string, platform: "ios" | "android" = "ios") => ({
  file: platform === "ios" ? "App.swift" : "App.kt", text, platform,
});
const privacy = (data: Record<string, unknown>) => ({ file: "PrivacyInfo.xcprivacy", data });

describe("rule registry", () => {
  it("has unique rule IDs and policy links", () => {
    expect(new Set(builtInRules.map((rule) => rule.id)).size).toBe(builtInRules.length);
    for (const rule of builtInRules) {
      expect(rule.policyUrl).toMatch(/^https:\/\//);
      expect(rule.description, rule.id).toBeTruthy();
    }
  });
  it("does not invent findings for empty inputs", () => {
    for (const rule of builtInRules) expect(rule.check(model(), context), rule.id).toEqual([]);
  });
});

describe("current iPhone screenshot groups", () => {
  it.each([
    [1398, 2034, "iphone-duo-outer"], [2034, 1398, "iphone-duo-outer"],
    [2007, 2853, "iphone-duo-inner"], [2853, 2007, "iphone-duo-inner"],
  ] as const)("recognizes %sx%s as %s without inventing a future upload requirement", (width, height, group) => {
    expect(iosScreenshotGroup(width, height)).toBe(group);
    expect(check("metadata/screenshot-dimensions", model({
      locales: [locale({ screenshots: [{ file: "duo.png", group, width, height }] })],
    }))).toEqual([]);
  });
});

describe("iOS", () => {
  it("checks usage descriptions and accepts meaningful strings", () => {
    const sources = [source("AVCaptureDevice()")];
    expect(check("ios/usage-descriptions", model({ ios: [ios()], sources }))).toHaveLength(1);
    expect(check("ios/usage-descriptions", model({
      ios: [ios({ info: { NSCameraUsageDescription: "Scan release QR codes." } })], sources,
    }))).toEqual([]);
  });
  it("requires both location strings for always authorization", () => {
    expect(check("ios/usage-descriptions", model({
      ios: [ios()], sources: [source("manager.requestAlwaysAuthorization()")],
    }))).toHaveLength(2);
  });
  it("requires a manifest only when covered API use was detected", () => {
    expect(check("ios/privacy-manifest", model({ ios: [ios()] }))).toEqual([]);
    expect(check("ios/privacy-manifest", model({
      ios: [ios()], sources: [source("UserDefaults.standard")],
    }))).toHaveLength(1);
  });
  it("checks required-reason coverage", () => {
    const base = { ios: [ios()], sources: [source("UserDefaults.standard")] };
    expect(check("ios/required-reasons", model({ ...base, privacy: [privacy({})] }))).toHaveLength(1);
    expect(check("ios/required-reasons", model({
      ...base, privacy: [privacy({ NSPrivacyAccessedAPITypes: [{
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
        NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
      }] })],
    }))).toEqual([]);
  });
  it.each([
    { NSPrivacyTracking: "false" },
    { NSPrivacyTracking: true, NSPrivacyTrackingDomains: [] },
    { NSPrivacyAccessedAPITypes: [{ NSPrivacyAccessedAPIType: "unknown", NSPrivacyAccessedAPITypeReasons: [] }] },
    { NSPrivacyCollectedDataTypes: [{ NSPrivacyCollectedDataType: "Email" }] },
    { NSPrivacyAccessedAPITypes: [{ NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["garbage"] }] },
  ])("rejects malformed privacy manifest %j", (data) => {
    expect(check("ios/privacy-schema", model({ privacy: [privacy(data)] })).length).toBeGreaterThan(0);
  });
  it("accepts an empty non-tracking manifest and valid tracking structure", () => {
    expect(check("ios/privacy-schema", model({ privacy: [
      privacy({}), privacy({ NSPrivacyTracking: true, NSPrivacyTrackingDomains: ["tracking.example.com"] }),
    ] }))).toEqual([]);
  });
  it("flags ATS exceptions, not an ordinary secure app", () => {
    expect(check("ios/transport-security", model({ ios: [ios()] }))).toEqual([]);
    expect(check("ios/transport-security", model({
      ios: [ios({ info: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } })],
    }))).toHaveLength(1);
  });
  it.each(["1", "1.0", "1.0.x"])("rejects release version %s", (version) => {
    expect(check("ios/version-format", model({ ios: [ios({ version })] }))).toHaveLength(1);
  });
  it.each(["0", "10000", "1.100", "1.2.3.4"])("rejects build %s", (build) => {
    expect(check("ios/version-format", model({ ios: [ios({ build })] }))).toHaveLength(1);
  });
  it.each(["1", "9999.99.99", "2.0"])("accepts build %s", (build) => {
    expect(check("ios/version-format", model({ ios: [ios({ build })] }))).toEqual([]);
  });
  it("detects app/extension version mismatch", () => {
    expect(check("ios/version-consistency", model({ ios: [ios(), ios({ name: "Widget", build: "2" })] }))).toHaveLength(2);
    expect(check("ios/version-consistency", model({ ios: [ios(), ios()] }))).toEqual([]);
  });
  it("does not compare independently versioned Xcode projects", () => {
    expect(check("ios/version-consistency", model({
      ios: [ios({ project: "One.xcodeproj" }), ios({ project: "Two.xcodeproj", build: "2" })],
    }))).toEqual([]);
  });
  it("reports deprecated APIs with source line numbers", () => {
    expect(check("ios/deprecated-apis", model({ sources: [source("\nlet view = UIWebView()")] })))
      .toEqual([{ file: "App.swift", line: 2, message: "Deprecated iOS API: UIWebView." }]);
  });
});

describe("Android", () => {
  it("rejects an old phone target but skips unresolved ones", () => {
    expect(check("android/target-sdk", model({ android: [android({ targetSdk: 35 })] }))).toHaveLength(1);
    const app = android();
    delete app.targetSdk;
    expect(check("android/target-sdk", model({ android: [app] }))).toEqual([]);
  });
  it("skips unresolved iOS version variables", () => {
    expect(check("ios/version-format", model({
      ios: [ios({ version: "$(FLUTTER_BUILD_NAME)", build: "$(FLUTTER_BUILD_NUMBER)" })],
    }))).toEqual([]);
  });
  it("accepts each device category's published minimum", () => {
    const rule = builtInRules.find((rule) => rule.id === "android/target-sdk")!;
    for (const androidDevice of ["phone", "wear", "automotive", "tv", "xr"] as const) {
      expect(rule.check(model({ android: [android({ targetSdk: requirements.androidTarget[androidDevice] })] }),
        { ...context, androidDevice })).toEqual([]);
    }
  });
  it("requires exported for all four intent-filter component types", () => {
    const application: Record<string, JsonObject> = Object.fromEntries(["activity", "activity-alias", "service", "receiver"]
      .map((kind) => [kind, { "android:name": ".Component", "intent-filter": {} }]));
    expect(check("android/exported-components", model({ android: [android({ manifest: { application } })] }))).toHaveLength(4);
    application.activity = { ...application.activity, "android:exported": "false" };
    expect(check("android/exported-components", model({ android: [android({ manifest: { application } })] }))).toHaveLength(3);
    expect(check("android/exported-components", model({ android: [android({ targetSdk: 30, manifest: { application } })] }))).toEqual([]);
  });
  it.each([0, -1, 1.5, 2100000001])("rejects versionCode %s", (versionCode) => {
    expect(check("android/version-code", model({ android: [android({ versionCode })] }))).toHaveLength(1);
  });
  it.each([1, 2100000000])("accepts versionCode %s", (versionCode) => {
    expect(check("android/version-code", model({ android: [android({ versionCode })] }))).toEqual([]);
  });
  it("requires increasing versionCode", () => {
    expect(check("android/version-increment", model({ android: [android({ versionCode: 1 })] }))).toHaveLength(1);
    expect(check("android/version-increment", model({ android: [android()] }))).toEqual([]);
  });
  it("makes absent baseline visible", () => {
    const app = android();
    delete app.previousVersionCode;
    expect(check("android/version-baseline", model({ android: [app] }))).toHaveLength(1);
  });
  it("checks versionName", () => {
    expect(check("android/version-name", model({ android: [android({ versionName: "" })] }))).toHaveLength(1);
  });
  it("flags sensitive permissions and missing camera permission", () => {
    expect(check("android/sensitive-permissions", model({
      android: [android({ manifest: { "uses-permission": { "android:name": "android.permission.READ_SMS" } } })],
    }))).toHaveLength(1);
    const sources = [source("CameraManager", "android")];
    expect(check("android/missing-permissions", model({ android: [android()], sources }))).toHaveLength(1);
    expect(check("android/missing-permissions", model({
      android: [android({ manifest: { "uses-permission": { "android:name": "android.permission.CAMERA" } } })], sources,
    }))).toEqual([]);
  });
  it.each([
    ["android/debuggable", "android:debuggable"],
    ["android/cleartext-traffic", "android:usesCleartextTraffic"],
  ])("checks %s", (id, field) => {
    expect(check(id!, model({ android: [android({ manifest: { application: { [field!]: "true" } } })] }))).toHaveLength(1);
    expect(check(id!, model({ android: [android({ manifest: { application: { [field!]: "false" } } })] }))).toEqual([]);
  });
  it("finds Android deprecated APIs", () => {
    expect(check("android/deprecated-apis", model({ sources: [source("AsyncTask\nstartActivityForResult()", "android")] }))).toHaveLength(2);
  });
});

describe("metadata boundaries", () => {
  for (const platform of ["ios", "android"] as const) {
    for (const [field, limit] of Object.entries(requirements.metadata[platform])) {
      it(`${platform} ${field} accepts exactly ${limit.max} and rejects one more`, () => {
        const project = (length: number) => model({
          locales: [locale({ platform, fields: { [field]: { file: `${field}.txt`, value: "a".repeat(length) } } })],
        });
        expect(check("metadata/lengths", project(limit.max))).toEqual([]);
        expect(check("metadata/lengths", project(limit.max + 1))).toHaveLength(1);
      });
    }
  }
  it("counts keywords as UTF-8 bytes, not JS string length", () => {
    expect(check("metadata/lengths", model({ locales: [locale({
      fields: { keywords: { file: "keywords.txt", value: "é".repeat(51) } },
    })] }))).toHaveLength(1);
  });
  it("counts Unicode code points in non-keyword fields", () => {
    expect(check("metadata/lengths", model({ locales: [locale({
      fields: { name: { file: "name.txt", value: "🚀".repeat(30) } },
    })] }))).toEqual([]);
  });
  it("detects required fields and blank text", () => {
    expect(check("metadata/required-fields", model({ locales: [locale({ fields: {} })] }))).toEqual([]);
    expect(check("metadata/completeness", model({ locales: [locale({ fields: {} })] }))).toHaveLength(3);
    expect(check("metadata/required-fields", model({ locales: [locale({
      fields: { name: { file: "name.txt", value: " " } },
    })] }))).toHaveLength(1);
    expect(check("metadata/required-fields", model({ locales: [locale()] }))).toEqual([]);
  });
  it("checks default-locale presence and translated-field parity", () => {
    expect(check("metadata/localizations", model({ locales: [locale({ locale: "fr-FR" })] }))).toHaveLength(1);
    expect(check("metadata/localizations", model({
      locales: [locale(), locale({ locale: "fr-FR", fields: {} })],
    }))).toEqual([]);
  });
  it.each([[1179, 2556], [2556, 1179], [2064, 2752]])("recognizes iOS size %sx%s", (w, h) => {
    expect(iosScreenshotGroup(w, h)).toBeDefined();
  });
  it("rejects unknown iOS image sizes", () => {
    expect(iosScreenshotGroup(1000, 1000)).toBeUndefined();
    expect(check("metadata/screenshot-dimensions", model({
      locales: [locale({ screenshots: [{ file: "x.png", width: 1000, height: 1000, group: "unknown" }] })],
    }))).toHaveLength(1);
  });
  it.each([
    [640, 1096, true], [1096, 640, false], [1136, 600, true], [600, 1136, false],
    [1536, 2008, true], [2008, 1536, false], [2048, 1496, true], [1496, 2048, false],
  ])("enforces legacy screenshot orientation %sx%s", (w, h, accepted) => {
    expect(iosScreenshotGroup(w, h) !== undefined).toBe(accepted);
  });
  it("uses the relevant store's policy link", () => {
    const findings = check("metadata/lengths", model({ locales: [
      locale({ platform: "android", fields: { title: { file: "title.txt", value: "x".repeat(31) } } }),
    ] }));
    expect(findings[0]?.policyUrl).toBe(requirements.sources.androidMetadata);
  });
  it.each([
    [320, 320, 0], [320, 640, 0], [1920, 3840, 0],
    [319, 640, 1], [320, 641, 1], [3841, 3841, 1],
  ])("checks Play image %sx%s at exact boundaries", (width, height, count) => {
    expect(check("metadata/screenshot-dimensions", model({ locales: [locale({
      platform: "android", screenshots: [{ file: "x.png", width, height, group: "phoneScreenshots" }],
    })] }))).toHaveLength(count);
  });
  it("checks count limits per device group and minimum total", () => {
    expect(check("metadata/screenshot-counts", model({ locales: [locale({ screenshots: [] })] }))).toEqual([]);
    expect(check("metadata/completeness", model({ locales: [locale({ screenshots: [] })] }))).toHaveLength(1);
    const shot = { file: "x.png", width: 1080, height: 1920, group: "phoneScreenshots" };
    const project = (count: number) => model({
      locales: [locale({ platform: "android", screenshots: Array.from({ length: count }, () => shot) })],
    });
    expect(check("metadata/screenshot-counts", project(1))).toHaveLength(1);
    expect(check("metadata/screenshot-counts", project(8))).toEqual([]);
    expect(check("metadata/screenshot-counts", project(9))).toHaveLength(1);
    expect(check("metadata/screenshot-counts", model({
      locales: [locale({ screenshots: Array.from({ length: 11 }, () => locale().screenshots[0]!) })],
    }))).toHaveLength(1);
  });
  it("requires an iPad screenshot when supporting iPad", () => {
    expect(check("metadata/ios-required-screenshots", model({
      ios: [ios({ info: { UIDeviceFamily: [1, 2] } })], locales: [locale()],
    }))).toHaveLength(1);
  });
  it("does not certify specialized screenshot groups or count them toward phone minimums", () => {
    const project = model({ locales: [locale({
      platform: "android",
      screenshots: Array.from({ length: 2 }, () => ({ file: "wear.png", width: 384, height: 384, group: "wearScreenshots" })),
    })] });
    expect(check("metadata/screenshot-counts", project)).toEqual([]);
    expect(check("metadata/completeness", project).some((finding) => finding.message.includes("screenshots"))).toBe(true);
    expect(check("system/specialized-android-store", project)).toHaveLength(1);
  });
});

describe("engine", () => {
  it("overrides severities, disables rules and produces exact summary counts", () => {
    const report = runRules(model({ ios: [ios({ build: "0" })], sources: [source("UIWebView")] }),
      builtInRules, configSchema.parse({ rules: { "ios/version-format": "warning", "ios/deprecated-apis": "off" } }),
      { now: context.now });
    expect(report.summary).toEqual({ error: 0, warning: 1, note: 2 });
    expect(report.findings[0]?.ruleId).toBe("ios/version-format");
  });
  it("supports object-form overrides and deterministic sorting", () => {
    const report = runRules(model({
      ios: [ios({ build: "0" })], sources: [source("UIWebView")],
    }), builtInRules, configSchema.parse({ rules: { "ios/deprecated-apis": { severity: "error" } } }), { now: context.now });
    expect(report.findings.map((finding) => finding.severity)).toEqual(["error", "error", "note", "note"]);
  });
  it("filters platform-specific rules and all-platform metadata", () => {
    const report = runRules(model({
      ios: [ios({ build: "0" })], android: [android()],
      locales: [locale({ fields: {} })],
    }), builtInRules, config, { platform: "android", now: context.now });
    expect(report.findings).toEqual([]);
  });
  it("surfaces plugin exceptions and malformed results", () => {
    const base = builtInRules[0]!;
    expect(() => runRules(model(), [{ ...base, check() { throw new Error("broken"); } }], config))
      .toThrow(`Rule ${base.id} failed`);
    expect(() => runRules(model(), [{ ...base, check: () => [{ file: "", message: "" }] }], config))
      .toThrow(`Rule ${base.id} failed`);
  });
  it("warns exactly after the requirements review deadline", () => {
    const cutoff = Date.parse(requirements.verifiedOn) + requirements.reviewAfterDays * 86400000;
    expect(runRules(model(), builtInRules, config, { now: new Date(cutoff) }).findings).toEqual([]);
    expect(runRules(model(), builtInRules, config, { now: new Date(cutoff + 1) }).findings[0]?.ruleId)
      .toBe("system/requirements-stale");
  });
  it("warns when specialized Android screenshot checks are unsupported", () => {
    const report = runRules(model({ android: [android()] }), builtInRules,
      configSchema.parse({ androidDevice: "tv" }), { now: context.now });
    expect(report.findings[0]?.ruleId).toBe("system/specialized-android-store");
  });
});
