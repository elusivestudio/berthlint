import { dirname, resolve, relative } from "node:path";
import xcode from "xcode";
import type { Config } from "../config.ts";
import type { Finding, IosBundle } from "../types.ts";
import { array, flutterVersion, object, portable, reference, tryReadPlist, unquote } from "./helpers.ts";
import { targetSources } from "./xcode-sources.ts";

export async function loadIos(
  root: string, files: readonly string[], config: Config, diagnostics: Finding[],
  excludedSources: Set<string> = new Set(),
): Promise<IosBundle[]> {
  const bundles: IosBundle[] = [];
  const projects = files.filter((f) => f.endsWith(".xcodeproj/project.pbxproj"));
  for (const file of projects) {
    let project: ReturnType<ReturnType<typeof xcode.project>["parseSync"]>;
    try {
      project = xcode.project(resolve(root, file)).parseSync();
    } catch (error) {
      diagnostics.push({
        ruleId: "system/analysis", severity: "warning", file,
        message: `Skipped unparseable Xcode project: ${error instanceof Error ? error.message : String(error)}`,
        fix: "Verify the project opens in Xcode, or exclude third-party projects from the scan directory.",
        policyUrl: "https://developer.apple.com/documentation/xcode",
      });
      continue;
    }
    const objects = project.hash.project.objects;
    if (!objects.PBXProject || !objects.XCConfigurationList || !objects.XCBuildConfiguration) {
      throw new Error(`${file}: unrecognized Xcode project sections; expected the standard Xcode .pbxproj layout.`);
    }
    const projectRoot = dirname(dirname(resolve(root, file)));
    const flutter = await flutterVersion(root, projectRoot);
    const owner = object(Object.values(objects.PBXProject).find((v) => typeof v === "object"));
    const projectConfigurations = object(objects.XCConfigurationList[unquote(owner.buildConfigurationList) ?? ""]);
    const ids = array(projectConfigurations.buildConfigurations).map(reference);
    const inherited = object(ids.map((id) => object(objects.XCBuildConfiguration[id ?? ""]))
      .find((v) => unquote(v.name) === config.configuration)?.buildSettings);

    const xcconfigTargets: string[] = [];
    const unresolvedVersions: string[] = [];
    for (const [targetId, target] of Object.entries(objects.PBXNativeTarget ?? {})) {
      if (typeof target !== "object" || target === null) continue;
      const kind = unquote(target.productType) ?? "";
      if (/(?:watch|unit-test|ui-testing)/.test(kind)) {
        for (const source of targetSources(root, projectRoot, objects, targetId, files)) excludedSources.add(source);
      }
      if (!["com.apple.product-type.application", "com.apple.product-type.app-extension"].includes(kind)) continue;
      const list = object(objects.XCConfigurationList[unquote(target.buildConfigurationList) ?? ""]);
      const configurations = array(list.buildConfigurations).map((v) =>
        object(objects.XCBuildConfiguration[reference(v)]));
      const selected = configurations.find((v) => unquote(v.name) === config.configuration);
      if (!selected) {
        const available = configurations.map((configuration) => unquote(configuration.name)).filter(Boolean);
        throw new Error(`${file}: target ${unquote(target.name)} has no ${config.configuration} configuration. Available configurations: ${available.join(", ")}. Select one with --configuration <name> or configuration in shipcheck.config.json. For repositories containing separate apps, scan the intended app subdirectory.`);
      }
      const settings = { ...inherited, ...object(selected.buildSettings) };
      const sdk = unquote(settings.SDKROOT);
      const platforms = unquote(settings.SUPPORTED_PLATFORMS)?.split(/\s+/).filter(Boolean);
      const nonIos = /^(?:watch(?:os|simulator)|appletv(?:os|simulator)|xr(?:os|simulator)|macosx)(?:\d.*)?$/;
      if ((sdk && nonIos.test(sdk))
        || (platforms?.length && platforms.every((value) => nonIos.test(value)))
        || (!sdk && settings.WATCHOS_DEPLOYMENT_TARGET !== undefined && settings.IPHONEOS_DEPLOYMENT_TARGET === undefined)) {
        for (const source of targetSources(root, projectRoot, objects, targetId, files)) excludedSources.add(source);
        continue;
      }
      const expand = (value: unknown): string | undefined => unquote(value)?.replace(
        /\$\(([^)]+)\)|\$\{([^}]+)\}/g,
        (token: string, a: string | undefined, b: string | undefined) => {
          const key = a ?? b ?? "";
          if (key === "FLUTTER_BUILD_NAME" && flutter) return flutter.name;
          if (key === "FLUTTER_BUILD_NUMBER" && flutter?.build) return flutter.build;
          return ["SRCROOT", "PROJECT_DIR"].includes(key)
            ? projectRoot : unquote(settings[key]) ?? token;
        },
      );
      const plistPath = expand(settings.INFOPLIST_FILE);
      let info = {};
      let location = file;
      if (plistPath && !plistPath.includes("$")) {
        const absolute = resolve(projectRoot, plistPath);
        location = portable(relative(root, absolute));
        info = (await tryReadPlist(absolute, location, diagnostics)) ?? {};
      } else if (settings.GENERATE_INFOPLIST_FILE !== "YES") {
        diagnostics.push({
          ruleId: "system/analysis", severity: "warning", file,
          message: `Cannot resolve Info.plist for ${unquote(target.name)} (${config.configuration}).`,
          fix: "Use literal Release build settings or inspect the resolved Xcode build settings manually.",
          policyUrl: "https://developer.apple.com/documentation/bundleresources/information-property-list",
        });
      }
      const generated = Object.fromEntries(Object.entries(settings)
        .filter(([key]) => key.startsWith("INFOPLIST_KEY_"))
        .map(([key, value]) => [key.slice("INFOPLIST_KEY_".length), expand(value)]));
      const merged = { ...generated, ...info };
      const families = expand(settings.TARGETED_DEVICE_FAMILY);
      if (!("UIDeviceFamily" in merged) && families && /^[12](?:,\s*[12])*$/.test(families)) {
        Object.assign(merged, { UIDeviceFamily: families.split(",").map(Number) });
      }
      const version = expand(object(merged).CFBundleShortVersionString ?? settings.MARKETING_VERSION);
      const build = expand(object(merged).CFBundleVersion ?? settings.CURRENT_PROJECT_VERSION);
      const deploymentTarget = expand(settings.IPHONEOS_DEPLOYMENT_TARGET ?? object(merged).MinimumOSVersion);
      if ([version, build].some((value) => value && /\$[({]/.test(value))) {
        unresolvedVersions.push(`${unquote(target.name)} (${version}/${build})`);
      }
      bundles.push({
        file: location, project: file, name: unquote(target.name) ?? file, configuration: config.configuration,
        info: merged, ...(version !== undefined && { version }), ...(build !== undefined && { build }),
        ...(deploymentTarget !== undefined && { deploymentTarget }),
        sourceFiles: targetSources(root, projectRoot, objects, targetId, files),
      });
      if (selected.baseConfigurationReference || ids.some((id) =>
        object(objects.XCBuildConfiguration[id ?? ""]).baseConfigurationReference)) {
        xcconfigTargets.push(unquote(target.name) ?? targetId);
      }
    }
    if (xcconfigTargets.length) diagnostics.push({
      ruleId: "system/analysis", severity: "warning", file,
      message: `External xcconfig build settings are not evaluated for ${xcconfigTargets.length} target(s): ${xcconfigTargets.join(", ")}.`,
      fix: "Confirm the effective Release versions, permissions and Info.plist in Xcode.",
      policyUrl: "https://developer.apple.com/documentation/xcode/adding-a-build-configuration-file-to-your-project",
    });
    if (unresolvedVersions.length) diagnostics.push({
      ruleId: "system/analysis", severity: "warning", file,
      message: `Version or build is set by an unresolved variable for ${unresolvedVersions.length} target(s): ${unresolvedVersions.join(", ")}; version checks were skipped for these targets.`,
      fix: "Verify the effective release version and build number in Xcode or your CI build command.",
      policyUrl: "https://developer.apple.com/documentation/bundleresources/information-property-list",
    });
  }
  for (const file of files.filter((f) => projects.length === 0 && /(?:^|\/)Info\.plist$/.test(f))) {
    const info = await tryReadPlist(resolve(root, file), file, diagnostics);
    if (!info) continue;
    const supported = array(info.CFBundleSupportedPlatforms).map(unquote);
    if (info.WKWatchKitApp === true
      || (supported.length && !supported.some((value) => value === "iPhoneOS" || value === "iPhoneSimulator"))
      || (unquote(info.DTPlatformName) && !["iphoneos", "iphonesimulator"].includes(unquote(info.DTPlatformName)!))) continue;
    if (!("CFBundleShortVersionString" in info || "CFBundleVersion" in info)
      && bundles.length > 0) continue;
    const version = unquote(info.CFBundleShortVersionString);
    const build = unquote(info.CFBundleVersion);
    const deploymentTarget = unquote(info.MinimumOSVersion);
    bundles.push({
      file, name: dirname(file), configuration: config.configuration, info,
      ...(version !== undefined && { version }), ...(build !== undefined && { build }),
      ...(deploymentTarget !== undefined && { deploymentTarget }),
    });
  }
  for (const bundle of bundles) for (const source of bundle.sourceFiles ?? []) excludedSources.delete(source);
  return bundles;
}
