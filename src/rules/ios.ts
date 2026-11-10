import { z } from "zod";
import type { Rule } from "../types.ts";
import { requirements } from "../requirements.ts";
import { array, object } from "../loaders/helpers.ts";
import { defineRule, deprecatedMatches, sourceMatches } from "./helpers.ts";

const privacyUrl = requirements.sources.iosPrivacy;
const infoUrl = "https://developer.apple.com/documentation/bundleresources/information-property-list";
const permissions = [
  { pattern: /\b(?:AVCaptureDevice|AVCaptureSession|UIImagePickerController)\b/, key: "NSCameraUsageDescription" },
  { pattern: /\b(?:requestRecordPermission|AVAudioRecorder)\b/, key: "NSMicrophoneUsageDescription" },
  { pattern: /\b(?:requestWhenInUseAuthorization|requestAlwaysAuthorization)\b/, key: "NSLocationWhenInUseUsageDescription" },
  { pattern: /\brequestAlwaysAuthorization\b/, key: "NSLocationAlwaysAndWhenInUseUsageDescription" },
  { pattern: /\bPHPhotoLibrary\b/, key: "NSPhotoLibraryUsageDescription" },
  { pattern: /\bCNContactStore\b/, key: "NSContactsUsageDescription" },
  { pattern: /\bSFSpeechRecognizer\b/, key: "NSSpeechRecognitionUsageDescription" },
  { pattern: /\bCBCentralManager\b/, key: "NSBluetoothAlwaysUsageDescription" },
];

const requiredApis = [
  { pattern: /\b(?:UserDefaults|NSUserDefaults)\b/, category: "NSPrivacyAccessedAPICategoryUserDefaults" },
  { pattern: /\b(?:systemUptime|mach_absolute_time)\b/, category: "NSPrivacyAccessedAPICategorySystemBootTime" },
  { pattern: /\b(?:volumeAvailableCapacity|volumeAvailableCapacityForImportantUsage|systemFreeSize|statfs|statvfs)\b/, category: "NSPrivacyAccessedAPICategoryDiskSpace" },
  { pattern: /\b(?:contentModificationDate|creationDate|fileModificationDate|fstat|lstat)\b/, category: "NSPrivacyAccessedAPICategoryFileTimestamp" },
  { pattern: /\bactiveInputModes\b/, category: "NSPrivacyAccessedAPICategoryActiveKeyboards" },
];

const privacySchema = z.object({
  NSPrivacyTracking: z.boolean().optional(),
  NSPrivacyTrackingDomains: z.array(z.string().min(1)).optional(),
  NSPrivacyAccessedAPITypes: z.array(z.object({
    NSPrivacyAccessedAPIType: z.string().refine((value) => requirements.requiredReasonCategories.includes(value), "Unknown required-reason API category"),
    NSPrivacyAccessedAPITypeReasons: z.array(z.string().regex(/^[A-Z0-9]{4}\.\d+$/)).min(1),
  })).optional(),
  NSPrivacyCollectedDataTypes: z.array(z.object({
    NSPrivacyCollectedDataType: z.string().min(1),
    NSPrivacyCollectedDataTypeLinked: z.boolean(),
    NSPrivacyCollectedDataTypeTracking: z.boolean(),
    NSPrivacyCollectedDataTypePurposes: z.array(z.string().min(1)).min(1),
  })).optional(),
}).superRefine((data, context) => {
  if (data.NSPrivacyTracking && !data.NSPrivacyTrackingDomains?.length) {
    context.addIssue({ code: "custom", path: ["NSPrivacyTrackingDomains"], message: "Tracking requires tracking domains" });
  }
});

export const iosRules: Rule[] = [
  defineRule({
    id: "ios/usage-descriptions", title: "Permission usage descriptions", platform: "ios", severity: "warning",
    description: "Protected resources need meaningful purpose strings. Direct Xcode source membership and synchronized groups identify targets; unmapped sources produce a single ownership-review finding instead of claims against unrelated extensions. Package dependency reachability is not inferred.",
    policyUrl: infoUrl, fix: "Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.",
    check(model) {
      return permissions.flatMap(({ pattern, key }) => {
        const uses = sourceMatches(model, "ios", pattern);
        if (!uses.length) return [];
        const findings = model.ios.flatMap((bundle) => {
          const owned = bundle.sourceFiles === undefined ? uses : uses.filter((use) => bundle.sourceFiles!.includes(use.file));
          const description = bundle.info[key];
          return owned.length && (typeof description !== "string" || !description.trim() || /\$[({]/.test(description)) ? [{
            file: bundle.file,
            message: `${bundle.name} is missing ${key}; possible API use in ${owned[0]!.file}:${owned[0]!.line}.`,
          }] : [];
        });
        if (model.ios.length && model.ios.every((bundle) => bundle.sourceFiles !== undefined)) {
          const unowned = uses.filter((use) => !model.ios.some((bundle) => bundle.sourceFiles!.includes(use.file)));
          if (unowned.length) findings.push({
            file: unowned[0]!.file,
            message: `Possible API use requiring ${key} in ${unowned[0]!.file}:${unowned[0]!.line}; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.`,
          });
        }
        return findings;
      });
    },
  }),
  defineRule({
    id: "ios/privacy-manifest", title: "Required privacy manifest", platform: "ios", severity: "error",
    description: "Detected required-reason API use needs a bundled privacy manifest. Finding a manifest somewhere in the repository does not establish bundle membership.",
    policyUrl: privacyUrl, fix: "Add PrivacyInfo.xcprivacy to each bundle that uses required-reason APIs.",
    check(model) {
      if (model.privacy.length || !model.ios.length) return [];
      const uses = requiredApis.flatMap(({ pattern }) => sourceMatches(model, "ios", pattern));
      return uses.length ? [{ file: uses[0]!.file, message: "Required-reason API use detected, but no PrivacyInfo.xcprivacy was found." }] : [];
    },
  }),
  defineRule({
    id: "ios/privacy-schema", title: "Privacy manifest structure", platform: "ios", severity: "error",
    description: "Malformed privacy fields can prevent correct submission. This validates structure and reason-code syntax, not Apple's approval of a reason for a category.",
    policyUrl: privacyUrl, fix: "Correct manifest field types and supply nonempty reason codes and complete collected-data declarations.",
    check: (model) => model.privacy.flatMap((manifest) => {
      const parsed = privacySchema.safeParse(manifest.data);
      return parsed.success ? [] : parsed.error.issues.map((issue) => ({
        file: manifest.file, message: `${issue.path.join(".")}: ${issue.message}`,
      }));
    }),
  }),
  defineRule({
    id: "ios/required-reasons", title: "Required-reason API coverage", platform: "ios", severity: "warning",
    description: "Each detected API category needs a truthful approved reason. Declarations are combined across scanned manifests; review each app and extension separately.",
    policyUrl: privacyUrl, fix: "Declare an approved, truthful reason in the manifest of the bundle using the API. Review SDK manifests separately.",
    check(model) {
      if (!model.ios.length || !model.privacy.length) return [];
      const declared = new Set(model.privacy.flatMap((manifest) => array(manifest.data.NSPrivacyAccessedAPITypes)
        .filter((entry) => Array.isArray(object(entry).NSPrivacyAccessedAPITypeReasons)
          && (object(entry).NSPrivacyAccessedAPITypeReasons as unknown[]).length > 0)
        .map((entry) => object(entry).NSPrivacyAccessedAPIType)));
      return requiredApis.flatMap(({ pattern, category }) => declared.has(category) ? []
        : sourceMatches(model, "ios", pattern).map((location) => ({
          ...location, message: `Possible ${category} use has no declared reason in the scanned manifests.`,
        })));
    },
  }),
  defineRule({
    id: "ios/transport-security", title: "App Transport Security exceptions", platform: "ios", severity: "warning",
    description: "Broad ATS bypasses and domain exceptions weaken transport protection and may need justification during App Review.",
    policyUrl: "https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity",
    fix: "Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.",
    check: (model) => model.ios.filter(({ info }) => {
      const ats = object(info.NSAppTransportSecurity);
      return ats.NSAllowsArbitraryLoads === true || ats.NSAllowsArbitraryLoadsInWebContent === true
        || ats.NSAllowsArbitraryLoadsForMedia === true || Object.keys(object(ats.NSExceptionDomains)).length > 0;
    }).map((bundle) => ({ file: bundle.file, message: `${bundle.name} declares ATS exceptions.` })),
  }),
  defineRule({
    id: "ios/version-format", title: "Release version and build format", platform: "ios", severity: "error",
    description: "Store submissions need numeric release versions and valid build numbers. Unresolved build variables are diagnosed by the loader instead of treated as literal versions.",
    policyUrl: infoUrl, fix: "Set a numeric major.minor.patch version and a positive one-to-three-component release build number.",
    check: (model) => model.ios.flatMap((bundle) => {
      const issues = [];
      const unresolved = (value?: string) => value !== undefined && /\$[({]/.test(value);
      if (!unresolved(bundle.version) && (!bundle.version || !/^\d+\.\d+\.\d+$/.test(bundle.version))) {
        issues.push({ file: bundle.file, message: `${bundle.name}: invalid or unresolved marketing version (${bundle.version ?? "missing"}).` });
      }
      if (!unresolved(bundle.build) && (!bundle.build || !/^[1-9]\d{0,3}(?:\.\d{1,2}){0,2}$/.test(bundle.build))) {
        issues.push({ file: bundle.file, message: `${bundle.name}: invalid or unresolved release build (${bundle.build ?? "missing"}).` });
      }
      return issues;
    }),
  }),
  defineRule({
    id: "ios/version-consistency", title: "App and extension version consistency", platform: "ios", severity: "warning",
    description: "App and embedded extension versions should agree. Only fully resolved version/build pairs in one project are compared; missing or unresolved targets are excluded. Independently versioned apps may need an override.",
    policyUrl: infoUrl, fix: "Align app and embedded extension versions and builds. Independently versioned apps may disable this rule.",
    check(model) {
      const resolved = model.ios.filter((bundle) => bundle.version && bundle.build
        && !/\$[({]/.test(bundle.version) && !/\$[({]/.test(bundle.build));
      const mismatched = resolved.filter((bundle) => {
        const peers = resolved.filter((other) => other.project === bundle.project);
        return new Set(peers.map((other) => other.version)).size > 1
          || new Set(peers.map((other) => other.build)).size > 1;
      });
      return mismatched.map((bundle) => ({
        file: bundle.file, message: `${bundle.name} is ${bundle.version}/${bundle.build}; scanned targets have differing versions or builds.`,
      }));
    },
  }),
  defineRule({
    id: "ios/deprecated-apis", title: "Deprecated iOS APIs", platform: "ios", severity: "warning",
    description: "Legacy UIKit APIs can cause compatibility or review issues. Imports are ignored and each API is reported once per file. This is a small token-based review list, not exhaustive deprecation analysis.",
    policyUrl: "https://developer.apple.com/documentation/webkit/wkwebview",
    fix: "Replace UIWebView with WKWebView and UIAlertView/UIActionSheet with UIAlertController.",
    check: (model) => deprecatedMatches(model, "ios", /\b(?:UIWebView|UIAlertView|UIActionSheet)\b/)
      .map((match) => ({ ...match, message: `Deprecated iOS API: ${match.message}.` })),
  }),
];
