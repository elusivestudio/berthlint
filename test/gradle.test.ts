import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config, put, tempProject } from "./helpers.ts";
import { loadProject } from "../src/loaders/index.ts";
import { configSchema } from "../src/config.ts";
import { parseGradle } from "../src/loaders/android.ts";

const manifest = `<manifest android:versionCode="9" android:versionName="manifest">
  <uses-sdk android:targetSdkVersion="34"/><application/></manifest>`;
const catalog = (sdk: string, code: string): string => `[versions]
app-build-targetSDK = "${sdk}"
app-build-code = "${code}"
[plugins]
android = { id = "com.android.application", version = "8.9.0" }
`;

describe("conservative Gradle shared-value resolution", () => {
  it("preserves literal Gradle parser behavior and rejects expression prefixes", () => {
    expect(parseGradle('targetSdk = 36\nversionCode(12)\nversionName = "1.2.3"'))
      .toEqual({ targetSdk: 36, versionCode: 12, versionName: "1.2.3" });
    expect(parseGradle("versionCode = 1 + 2\ntargetSdk = 36.toInt()")).toEqual({});
  });

  it("resolves catalog plugin aliases, numeric conversions, and shared properties", async () => {
    const root = await tempProject();
    await put(root, "app/src/main/AndroidManifest.xml", manifest);
    await put(root, "app/build.gradle.kts", `plugins { alias(libs.plugins.android) }
      val baseVersionCode = project.property("VERSION_CODE").toString().toInt()
      android { defaultConfig {
        targetSdk = project.libs.versions.app.build.targetSDK.get().toInt()
        versionCode = baseVersionCode
        versionName = project.property("VERSION_NAME").toString()
      } }`);
    await put(root, "gradle/libs.versions.toml", catalog("36", "39"));
    await put(root, "gradle.properties", "VERSION_CODE=40\nVERSION_NAME=1.14.2\n");

    const project = await loadProject(root, config);
    expect(project.android[0]).toMatchObject({
      targetSdk: 36, versionCode: 40, versionName: "1.14.2",
    });
    expect(project.diagnostics.some((finding) => finding.message.includes("Android application plugin"))).toBe(false);
    expect(project.diagnostics.some((finding) => finding.message.includes("Cannot statically resolve"))).toBe(false);
  });

  it("resolves catalog values with toInt and reports unsupported or absent references as skipped", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", manifest);
    await put(root, "build.gradle.kts", `plugins { alias(libs.plugins.android) }
      targetSdk = libs.versions.app.build.targetSDK.get().toInt()
      versionCode = providers.gradleProperty("VERSION_CODE").get().toInt()
      versionName = providers.gradleProperty("VERSION_NAME").get()`);
    await put(root, "gradle/libs.versions.toml", catalog("35", "1"));

    const withCatalog = await loadProject(root, config);
    expect(withCatalog.android[0]?.targetSdk).toBe(35);
    expect(withCatalog.android[0]?.versionCode).toBeUndefined();
    expect(withCatalog.android[0]?.versionName).toBeUndefined();
    expect(withCatalog.diagnostics.some((finding) =>
      finding.message.includes("Cannot statically resolve versionCode, versionName")
      && finding.message.includes("related checks were skipped"))).toBe(true);

    await put(root, "build.gradle.kts", `plugins { alias(libs.plugins.android) }
      targetSdk = libs.versions.app.build.targetSDK.get().toInt()`);
    await rm(resolve(root, "gradle/libs.versions.toml"));
    const withoutCatalog = await loadProject(root, config);
    expect(withoutCatalog.android[0]?.targetSdk).toBeUndefined();
    expect(withoutCatalog.diagnostics.some((finding) =>
      finding.message.includes("Cannot confirm this module uses the Android application plugin"))).toBe(true);
    expect(withoutCatalog.diagnostics.some((finding) =>
      finding.message.includes("Cannot statically resolve targetSdk"))).toBe(true);
  });

  it("does not resolve expression prefixes or similarly prefixed catalog keys", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", manifest);
    await put(root, "build.gradle.kts", `plugins { id("com.android.application") }
      targetSdk = libs.versions.app.build.targetSDK.get().toInt() + 1`);
    await put(root, "gradle/libs.versions.toml",
      `[versions]\napp-build-targetSDK-extra = "37"\n`);

    const project = await loadProject(root, config);
    expect(project.android[0]?.targetSdk).toBeUndefined();
    expect(project.diagnostics.some((finding) =>
      finding.message.includes("Cannot statically resolve targetSdk"))).toBe(true);
  });

  it.each([
    ["duplicate", `[versions]\napp-build-code = "40"\napp-build-code = "41"\n`],
    ["malformed", `[versions]\napp-build-code = { invalid }\n`],
  ])("fails explicitly for %s catalog entries instead of resolving partial values", async (_kind, versionSection) => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", manifest);
    await put(root, "build.gradle.kts", `plugins { id("com.android.application") }
      versionCode = libs.versions.app.build.code.get().toInt()`);
    await put(root, "gradle/libs.versions.toml", versionSection);

    await expect(loadProject(root, config)).rejects.toThrow(/Gradle version catalog/);
  });

  it("compares baseline version codes using baseline catalog values", async () => {
    const root = await tempProject();
    await put(root, "app/src/main/AndroidManifest.xml", manifest);
    await put(root, "app/build.gradle.kts", `plugins { alias(libs.plugins.android) }
      targetSdk = libs.versions.app.build.targetSDK.get().toInt()
      versionCode = libs.versions.app.build.code.get().toInt()`);
    await put(root, "gradle/libs.versions.toml", catalog("35", "40"));
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
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Baseline values");
    git("tag", "v1.0.0");

    await put(root, "gradle/libs.versions.toml", catalog("36", "41"));
    const project = await loadProject(root, configSchema.parse({ baselineTag: "v1.0.0" }));
    expect(project.android[0]).toMatchObject({ targetSdk: 36, versionCode: 41, previousVersionCode: 40 });
  });

  it("uses baseline gradle.properties rather than current shared version values", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", manifest);
    await put(root, "build.gradle.kts", `plugins { id("com.android.application") }
      val baseVersionCode = project.property("VERSION_CODE").toString().toInt()
      versionCode = baseVersionCode`);
    await put(root, "gradle.properties", "VERSION_CODE=40\n");
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
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Baseline shared property");
    git("tag", "v1.0.0");
    await put(root, "gradle.properties", "VERSION_CODE=41\n");

    const project = await loadProject(root, configSchema.parse({ baselineTag: "v1.0.0" }));
    expect(project.android[0]).toMatchObject({ versionCode: 41, previousVersionCode: 40 });
  });

  it("fails explicitly when a historical shared value is unavailable", async () => {
    const root = await tempProject();
    await put(root, "AndroidManifest.xml", manifest);
    await put(root, "build.gradle.kts", `plugins { id("com.android.application") }
      versionCode = libs.versions.app.build.code.get().toInt()`);
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
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Missing catalog");
    git("tag", "v1.0.0");
    await put(root, "gradle/libs.versions.toml", catalog("36", "41"));

    await expect(loadProject(root, configSchema.parse({ baselineTag: "v1.0.0" })))
      .rejects.toThrow("using baseline Gradle inputs");
  });
});
