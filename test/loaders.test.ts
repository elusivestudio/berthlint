import { cp, mkdir, readFile, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "../src/loaders/index.ts";
import { parseGradle } from "../src/loaders/android.ts";
import { stripComments } from "../src/loaders/helpers.ts";
import { configSchema, loadConfig } from "../src/config.ts";
import { builtInRules } from "../src/rules/index.ts";
import { runRules, loadRules } from "../src/engine.ts";
import { config, context, png, put, tempProject } from "./helpers.ts";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

describe("native project loaders", () => {
  it("loads iOS XML, source and privacy manifests", async () => {
    const project = await loadProject(resolve(fixtures, "ios"), config);
    expect(project.ios[0]).toMatchObject({ version: "1.0.0", build: "2" });
    expect(project.sources).toHaveLength(1);
    expect(project.privacy).toHaveLength(1);
    expect(runRules(project, builtInRules, config, { now: context.now }).summary.error).toBe(0);
    expect(project.diagnostics[0]?.message).toContain("No ios store metadata");
  });
  it("loads literal Kotlin Gradle and XML components", async () => {
    const project = await loadProject(resolve(fixtures, "android"), config);
    expect(project.android[0]).toMatchObject({ targetSdk: 36, versionCode: 2, versionName: "1.0.0" });
    expect(runRules(project, builtInRules, config, { now: context.now }).summary.error).toBe(0);
  });
  it("reads inherited Release Xcode settings and generated Info.plist fields", async () => {
    const project = await loadProject(resolve(fixtures, "xcode"), config);
    expect(project.ios).toHaveLength(1);
    expect(project.ios[0]).toMatchObject({
      version: "1.2.3", build: "7", name: "Fixture", info: { NSCameraUsageDescription: "Scan QR codes." },
    });
  });
  it("fails explicitly for missing Xcode configurations", async () => {
    await expect(loadProject(resolve(fixtures, "xcode"), configSchema.parse({ configuration: "Unknown" })))
      .rejects.toThrow("no Unknown configuration. Available configurations: Release. Select one with --configuration");
  });
  it("loads an explicitly selected custom archive configuration", async () => {
    const root = await tempProject();
    const file = "App.xcodeproj/project.pbxproj";
    const pbx = await readFile(resolve(fixtures, "xcode", file), "utf8");
    await put(root, file, pbx.replaceAll("Release", "Firefox"));
    const project = await loadProject(root, configSchema.parse({ configuration: "Firefox" }));
    expect(project.ios[0]).toMatchObject({ configuration: "Firefox", version: "1.2.3", build: "7" });
  });
  it("loads inherited, overridden and variable deployment targets from Xcode settings", async () => {
    const root = await tempProject();
    const file = "App.xcodeproj/project.pbxproj";
    const pbx = await readFile(resolve(fixtures, "xcode", file), "utf8");
    const inherited = pbx.replace("MARKETING_VERSION = 1.2.3;",
      "MARKETING_VERSION = 1.2.3; IPHONEOS_DEPLOYMENT_TARGET = 15.0;");
    await put(root, file, inherited);
    expect((await loadProject(root, config)).ios[0]?.deploymentTarget).toBe("15.0");
    await put(root, file, inherited.replace("GENERATE_INFOPLIST_FILE = YES;",
      'GENERATE_INFOPLIST_FILE = YES; MIN_IOS = 16.0; IPHONEOS_DEPLOYMENT_TARGET = "$(MIN_IOS)";'));
    expect((await loadProject(root, config)).ios[0]?.deploymentTarget).toBe("16.0");
    await put(root, file, inherited.replace("GENERATE_INFOPLIST_FILE = YES;",
      'GENERATE_INFOPLIST_FILE = YES; IPHONEOS_DEPLOYMENT_TARGET = "${UNRESOLVED}";'));
    expect((await loadProject(root, config)).ios[0]?.deploymentTarget).toBe("${UNRESOLVED}");
  });
  it("loads standalone MinimumOSVersion without inferring an SDK version", async () => {
    const root = await tempProject();
    await put(root, "Info.plist", `<?xml version="1.0"?><plist version="1.0"><dict>
      <key>CFBundleVersion</key><string>1</string>
      <key>CFBundleShortVersionString</key><string>1.0.0</string>
      <key>MinimumOSVersion</key><string>15.0</string></dict></plist>`);
    expect((await loadProject(root, config)).ios[0]?.deploymentTarget).toBe("15.0");
  });
  it("resolves Info.plist version variables without creating duplicate targets", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "xcode"), root, { recursive: true });
    const file = "App.xcodeproj/project.pbxproj";
    await put(root, file, (await readFile(resolve(root, file), "utf8"))
      .replace("GENERATE_INFOPLIST_FILE = YES;", 'INFOPLIST_FILE = "$(SRCROOT)/App/Info.plist";'));
    await put(root, "App/Info.plist", `<?xml version="1.0"?><plist version="1.0"><dict>
      <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
      <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
      </dict></plist>`);
    const project = await loadProject(root, config);
    expect(project.ios).toHaveLength(1);
    expect(project.ios[0]).toMatchObject({ version: "1.2.3", build: "7", file: "App/Info.plist" });
  });
  it("skips dependency directories and symlinked trees", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "Pods/Broken/Info.plist", "not a plist");
    await put(root, "node_modules/Broken/Info.plist", "not a plist");
    await symlink(resolve(root, "Pods"), resolve(root, "external"));
    expect((await loadProject(root, config)).ios).toHaveLength(1);
  });
  it("does not parse excluded platforms", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "android"), root, { recursive: true });
    await put(root, "ios/Info.plist", "invalid plist");
    expect((await loadProject(root, config, { platform: "android" })).android).toHaveLength(1);
    const full = await loadProject(root, config);
    expect(full.diagnostics.some((d) => d.message.includes("Skipped unreadable plist"))).toBe(true);
  });
  it("skips binary plists and framework bundles", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "ios"), root, { recursive: true });
    await put(root, "Vendor.framework/Info.plist", "bplist00");
    await put(root, "extra/PrivacyInfo.xcprivacy", "bplist00");
    const project = await loadProject(root, config);
    expect(project.diagnostics.filter((d) => d.message.includes("Vendor.framework"))).toHaveLength(0);
    expect(project.diagnostics.some((d) => d.message.includes("Binary plists"))).toBe(true);
  });
  it("rejects malformed Android XML and unsupported projects", async () => {
    const root = await tempProject();
    await expect(loadProject(root, config)).rejects.toThrow("No supported");
    await put(root, "app/src/main/AndroidManifest.xml", "<manifest><application></manifest>");
    await expect(loadProject(root, config)).rejects.toThrow("Invalid XML");
  });
  it("accepts an empty application element with manifest-level versions", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", `<manifest android:versionCode="3" android:versionName="1.2.0">
      <uses-sdk android:targetSdkVersion="36"/><application/></manifest>`);
    expect((await loadProject(root, config)).android[0]).toMatchObject({ targetSdk: 36, versionCode: 3 });
  });
  it("makes dynamic Gradle values unresolved rather than using misleading manifest defaults", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", `<manifest android:versionCode="1">
      <uses-sdk android:targetSdkVersion="36"/><application/></manifest>`);
    await put(root, "build.gradle.kts", `plugins { id("com.android.application") }
      targetSdk = libs.versions.target.get().toInt()
      versionCode = rootProject.extra["code"] as Int`);
    const project = await loadProject(root, config);
    expect(project.android[0]?.targetSdk).toBeUndefined();
    expect(project.android[0]?.versionCode).toBeUndefined();
    const report = runRules(project, builtInRules, config, { now: context.now });
    expect(report.summary.error).toBe(0);
    expect(report.findings.some((f) => f.message.includes("Cannot statically resolve targetSdk, versionCode"))).toBe(true);
  });
  it("resolves Flutter pubspec versions and ignores comments and macOS targets", async () => {
    const root = await tempProject();
    await put(root, "pubspec.yaml", "name: app\nversion: 1.2.3+45\n");
    await put(root, "android/app/src/main/AndroidManifest.xml", "<manifest><application/></manifest>");
    await put(root, "android/app/build.gradle.kts", `plugins { id("com.android.application") }
      android { defaultConfig {
        // versionCode comment
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
      } }`);
    const project = await loadProject(root, config);
    expect(project.android[0]).toMatchObject({ targetSdk: 36, versionCode: 45, versionName: "1.2.3" });
    expect(project.diagnostics.some((f) => f.message.includes("variants"))).toBe(false);
    expect(runRules(project, builtInRules, config, { now: context.now }).summary.error).toBe(0);
  });
  it("resolves Flutter iOS variables and skips macOS targets", async () => {
    const root = await tempProject();
    await put(root, "pubspec.yaml", "version: 2.0.1+9\n");
    const pbx = await readFile(resolve(fixtures, "xcode/App.xcodeproj/project.pbxproj"), "utf8");
    await put(root, "ios/Runner.xcodeproj/project.pbxproj", pbx
      .replace("MARKETING_VERSION = 1.2.3;", "MARKETING_VERSION = $(FLUTTER_BUILD_NAME);")
      .replace("CURRENT_PROJECT_VERSION = 7;", "CURRENT_PROJECT_VERSION = $(FLUTTER_BUILD_NUMBER);"));
    await put(root, "macos/Runner.xcodeproj/project.pbxproj", pbx
      .replace("GENERATE_INFOPLIST_FILE = YES;", "GENERATE_INFOPLIST_FILE = YES; SDKROOT = macosx;"));
    const project = await loadProject(root, config);
    expect(project.ios).toHaveLength(1);
    expect(project.ios[0]).toMatchObject({ version: "2.0.1", build: "9" });
  });
  it("warns about build variants", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "android"), root, { recursive: true });
    await put(root, "app/build.gradle.kts", `plugins { id("com.android.application") }
      targetSdk = 36
      versionCode = 3
      productFlavors { create("demo") {
        versionCode = 4
      } }`);
    expect((await loadProject(root, config)).diagnostics.some((f) => f.message.includes("variants"))).toBe(true);
    await put(root, "app/build.gradle.kts", `plugins { id("com.android.application") }
      targetSdk = 36
      versionCode = 3
      productFlavors { create("demo") { applicationIdSuffix = ".demo" } }`);
    expect((await loadProject(root, config)).diagnostics.some((f) => f.message.includes("variants"))).toBe(false);
  });
  it("compares the same Gradle file at an explicit release tag", async () => {
    const root = await tempProject();
    await cp(resolve(fixtures, "android"), root, { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      },
    });
    git("init");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Fixture baseline");
    git("tag", "v1.0.0");
    await put(root, "app/build.gradle.kts", `plugins { id("com.android.application") }
      targetSdk = 36
      versionCode = 3
      versionName = "1.0.1"`);
    const project = await loadProject(root, configSchema.parse({ baselineTag: "v1.0.0" }));
    expect(project.android[0]).toMatchObject({ versionCode: 3, previousVersionCode: 2 });
  });
});

describe("Gradle parsing", () => {
  it.each([
    "targetSdkVersion 36\nversionCode 12\nversionName '1.2.3'",
    'targetSdk = 36\nversionCode = 12\nversionName = "1.2.3"',
    'targetSdkVersion(36)\nversionCode(12)\nversionName("1.2.3")',
  ])("supports common literal DSL forms", (text) => {
    expect(parseGradle(text)).toEqual({ targetSdk: 36, versionCode: 12, versionName: "1.2.3" });
  });
  it("does not parse expression prefixes or comments as resolved numbers", () => {
    expect(parseGradle("// targetSdk = 36\nversionCode = 1 + 2\n/* targetSdk 36 */")).toEqual({});
    expect(parseGradle("versionCode = 1_000\ntargetSdk = 36.toInt()")).toEqual({});
  });
  it("preserves source line numbers while stripping comments and retaining quoted URLs", () => {
    expect(stripComments('/* UserDefaults\ncomment */\nlet url = "https://example.com" // UIWebView'))
      .toBe('               \n          \nlet url = "https://example.com"             ');
  });
});

describe("fastlane metadata", () => {
  it("loads standard iOS screenshots separately from metadata and strips a trailing line ending", async () => {
    const root = await tempProject();
    await put(root, "fastlane/metadata/en-US/name.txt", "\uFEFFShipcheck\r\n");
    await put(root, "fastlane/screenshots/en-US/01.png", png(1179, 2556));
    const project = await loadProject(root, config);
    expect(project.locales).toHaveLength(1);
    expect(project.locales[0]?.fields.name?.value).toBe("Shipcheck");
    expect(project.locales[0]?.screenshots[0]).toMatchObject({
      file: "fastlane/screenshots/en-US/01.png", width: 1179, height: 2556, group: "iphone-dynamic-medium",
    });
  });
  it("discovers Android locale metadata and image groups without treating android as an iOS locale", async () => {
    const root = await tempProject();
    await put(root, "fastlane/metadata/android/en-US/title.txt", "Shipcheck");
    await put(root, "fastlane/metadata/android/en-US/images/phoneScreenshots/01.png", png(320, 640));
    const project = await loadProject(root, config);
    expect(project.locales).toHaveLength(1);
    expect(project.locales[0]).toMatchObject({
      platform: "android", locale: "en-US",
      screenshots: [{ group: "phoneScreenshots", width: 320, height: 640 }],
    });
  });
  it("supports configured metadata and screenshot roots, including empty locale folders", async () => {
    const root = await tempProject();
    await mkdir(resolve(root, "store/en-US"), { recursive: true });
    await put(root, "images/en-US/01.png", png(1179, 2556));
    const project = await loadProject(root, configSchema.parse({ metadata: { ios: "store" }, screenshots: { ios: "images" } }));
    expect(project.locales[0]?.fields).toEqual({});
    expect(project.locales[0]?.screenshots).toHaveLength(1);
    const report = runRules(project, builtInRules, config, { now: context.now });
    expect(report.summary.error).toBe(0);
    expect(report.findings.filter((finding) => finding.ruleId === "metadata/completeness")).toHaveLength(3);
  });
  it("supports screenshot-only directories without a metadata folder", async () => {
    const root = await tempProject();
    await put(root, "fastlane/screenshots/en-US/01.png", png(1179, 2556));
    expect((await loadProject(root, config)).locales).toHaveLength(1);
  });
  it("surfaces unreadable images and missing explicitly configured directories", async () => {
    const root = await tempProject();
    await put(root, "fastlane/screenshots/en-US/broken.png", "not an image");
    await expect(loadProject(root, config)).rejects.toThrow();
    await expect(loadProject(root, configSchema.parse({ metadata: { ios: "missing" } }))).rejects.toThrow();
  });
});

describe("config and plugin loading", () => {
  it("uses defaults only for an absent optional config", async () => {
    const root = await tempProject();
    expect(await loadConfig(root)).toEqual(config);
    await expect(loadConfig(root, "missing.json")).rejects.toThrow("Cannot read config");
    await put(root, "shipcheck.config.json", '{"typo": true}');
    await expect(loadConfig(root)).rejects.toThrow("Invalid config");
    await put(root, "shipcheck.config.json", "{");
    await expect(loadConfig(root)).rejects.toThrow("Invalid config");
  });
  it("rejects unknown rule IDs", async () => {
    await expect(loadRules(await tempProject(), configSchema.parse({ rules: { "ios/typo": "off" } })))
      .rejects.toThrow("Unknown configured rule");
  });
  it("loads a trusted local ESM plugin and severity overrides", async () => {
    const root = await tempProject();
    await put(root, "plugin.mjs", `export default { rules: [{
      id: "team/check", title: "Team check", platform: "all", severity: "note",
      fix: "Review team policy.", policyUrl: "https://example.com",
      check: () => [{ file: "Info.plist", message: "Team policy finding." }]
    }] };`);
    const custom = configSchema.parse({ plugins: ["./plugin.mjs"], rules: { "team/check": "error" } });
    const rules = await loadRules(root, custom);
    expect(rules.at(-1)?.id).toBe("team/check");
  });
  it("resolves npm plugins with import-only exports relative to the scanned project", async () => {
    const root = await tempProject();
    await put(root, "node_modules/shipcheck-plugin-demo/package.json",
      JSON.stringify({ type: "module", exports: { import: "./index.js" } }));
    await put(root, "node_modules/shipcheck-plugin-demo/index.js", "export const rules = [];");
    expect(await loadRules(root, configSchema.parse({ plugins: ["shipcheck-plugin-demo"] }))).toHaveLength(builtInRules.length);
  });
  it("loads CommonJS plugins", async () => {
    const root = await tempProject();
    await put(root, "plugin.cjs", "module.exports = { rules: [] };");
    expect(await loadRules(root, configSchema.parse({ plugins: ["./plugin.cjs"] }))).toHaveLength(builtInRules.length);
  });
  it.each([
    ["export default { rules: [{}] }", "Invalid plugin"],
    [`export default { rules: [{
      id: "ios/version-format", title: "Duplicate", platform: "ios", severity: "error",
      fix: "Fix it.", policyUrl: "https://example.com", check: () => []
    }] }`, "Duplicate rule ID"],
  ])("rejects malformed or duplicate plugins", async (text, message) => {
    const root = await tempProject();
    await put(root, "plugin.mjs", text);
    await expect(loadRules(root, configSchema.parse({ plugins: ["./plugin.mjs"] }))).rejects.toThrow(message);
  });
});
