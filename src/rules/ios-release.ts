import type { Rule } from "../types.ts";
import { requirements } from "../requirements.ts";
import { compareVersions, releaseVersionSchema } from "../versions.ts";

const resolvedVersion = (value: string | undefined): value is string =>
  value !== undefined && releaseVersionSchema.safeParse(value).success;
const unresolved = (value: string): boolean => /\$\(|\$\{/.test(value);

export const iosReleaseRules: Rule[] = [
  {
    id: "ios/sdk-requirements", title: "Declared iOS SDK and Xcode requirements", platform: "ios", severity: "error",
    description: "App Store uploads must use the required SDK and Xcode releases. Versions are user declarations, not detected toolchains; SDKROOT=iphoneos and deployment targets do not establish an SDK version.",
    policyUrl: requirements.sources.iosSubmission,
    fix: "Build with the required release SDK and Xcode. Set iosSdkVersion/xcodeVersion in config or pass --ios-sdk-version/--xcode-version; verify the actual archive separately.",
    check(model, context) {
      if (!model.ios.length || context.now.getTime() < Date.parse(requirements.iosSubmission.effectiveOn)) return [];
      const { minimumSdk, minimumXcode, effectiveOn } = requirements.iosSubmission;
      const versions = [
        { name: "iOS SDK", version: context.iosSdkVersion, minimum: minimumSdk },
        { name: "Xcode", version: context.xcodeVersion, minimum: minimumXcode },
      ];
      return versions.filter(({ version, minimum }) => version !== undefined && compareVersions(version, minimum) < 0)
        .map(({ name, version, minimum }) => ({
          file: ".", message: `Declared ${name} ${version} is below ${minimum} required for App Store uploads since ${effectiveOn}. This is a declared value, not a detected build toolchain.`,
        }));
    },
  },
  {
    id: "ios/sdk-coverage", title: "iOS SDK declaration coverage", platform: "ios", severity: "note",
    description: "A project normally selects iphoneos, not a concrete SDK version. Missing user-declared SDK information must be reported instead of implying toolchain compliance.",
    policyUrl: requirements.sources.iosSubmission,
    fix: "Supply iosSdkVersion (or --ios-sdk-version) and optionally xcodeVersion. Use the build SDK, not the minimum deployment target. Verify the archive's actual toolchain separately.",
    check: (model, context) => model.ios.length && !context.iosSdkVersion
      ? [{ file: ".", message: "No iOS SDK version declared; SDK checks were skipped. Xcode/SDKROOT project settings do not prove which SDK will build the release." }] : [],
  },
  {
    id: "ios/deployment-target", title: "iOS deployment target compatibility", platform: "ios", severity: "error",
    description: "The minimum supported OS is distinct from the build SDK. Targets must be numeric, meet the dated App Store OS minimum, not exceed the declared SDK, and meet the documented deployment floor for a known declared Xcode family.",
    policyUrl: requirements.sources.xcodeSupport,
    fix: "Set IPHONEOS_DEPLOYMENT_TARGET to a supported OS version in the selected build configuration. Do not raise it to the SDK version unnecessarily; confirm xcconfig and CI overrides.",
    check: (model, context) => model.ios.flatMap((bundle) => {
      const target = bundle.deploymentTarget;
      const file = bundle.project ?? bundle.file;
      if (target === undefined || unresolved(target)) return [];
      if (!resolvedVersion(target)) return [{
        file, message: `${bundle.name}: invalid iOS deployment target (${target || "empty"}).`,
      }];
      const issues = [];
      if (context.now.getTime() >= Date.parse(requirements.iosDeployment.effectiveOn)
        && compareVersions(target, requirements.iosDeployment.minimum) < 0) {
        issues.push({
          file, message: `${bundle.name}: deployment target ${target} is below iOS ${requirements.iosDeployment.minimum} required for App Store uploads since ${requirements.iosDeployment.effectiveOn}.`,
          policyUrl: requirements.sources.iosDeployment,
        });
      }
      if (context.iosSdkVersion && compareVersions(target, context.iosSdkVersion) > 0) {
        issues.push({
          file, message: `${bundle.name}: deployment target ${target} exceeds declared iOS SDK ${context.iosSdkVersion}.`,
        });
      }
      const support = requirements.iosToolchains.find((entry) =>
        context.xcodeVersion && Number(context.xcodeVersion.split(".")[0]) === entry.xcodeMajor);
      if (support && compareVersions(target, support.minimumDeploymentTarget) < 0) {
        issues.push({
          file, message: `${bundle.name}: deployment target ${target} is below ${support.minimumDeploymentTarget} supported by the declared Xcode ${context.xcodeVersion} family.`,
        });
      }
      return issues;
    }),
  },
  {
    id: "ios/deployment-target-coverage", title: "iOS deployment target coverage", platform: "ios", severity: "note",
    description: "Missing or unresolved deployment settings cannot be certified from project text. External xcconfig files, generated settings and build overrides need independent verification.",
    policyUrl: requirements.sources.xcodeSupport,
    fix: "Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.",
    check(model, context) {
      const groups = new Map<string, { file: string; reason: string; targets: string[] }>();
      const add = (file: string, reason: string, target: string): void => {
        const key = `${file}\0${reason}`;
        const group = groups.get(key) ?? { file, reason, targets: [] };
        group.targets.push(target);
        groups.set(key, group);
      };
      const support = requirements.iosToolchains.find((entry) =>
        context.xcodeVersion && Number(context.xcodeVersion.split(".")[0]) === entry.xcodeMajor);
      for (const bundle of model.ios) {
        const file = bundle.project ?? bundle.file;
        if (bundle.deploymentTarget === undefined || unresolved(bundle.deploymentTarget)) {
          add(file, "deployment target missing or unresolved; deployment compatibility checks were skipped",
            `${bundle.name}${bundle.deploymentTarget === undefined ? "" : ` (${bundle.deploymentTarget})`}`);
        } else if (resolvedVersion(bundle.deploymentTarget) && !support) {
          add(file, `${context.xcodeVersion ? `Xcode ${context.xcodeVersion} has no verified deployment support range in this snapshot` : "no Xcode version declared"}; the Xcode deployment support range was not checked`,
            bundle.name);
        }
      }
      return [...groups.values()].map(({ file, reason, targets }) => ({
        file, message: `${reason} for ${targets.length} target(s): ${targets.join(", ")}.`,
      }));
    },
  },
];
