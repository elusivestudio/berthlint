import { z } from "zod";
import type { Rule } from "../types.ts";
import { requirements } from "../requirements.ts";
import { array, object } from "../loaders/helpers.ts";
import { defineRule, sourceMatches } from "./helpers.ts";

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
    policyUrl: infoUrl, fix: "Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.",
    check(model) {
      return permissions.flatMap(({ pattern, key }) => {
        const uses = sourceMatches(model, "ios", pattern);
        if (!uses.length) return [];
        return model.ios.filter((bundle) => typeof bundle.info[key] !== "string"
          || !(bundle.info[key] as string).trim() || (bundle.info[key] as string).includes("$("))
          .map((bundle) => ({
            file: bundle.file,
            message: `${bundle.name} is missing ${key}; possible API use in ${uses[0]!.file}:${uses[0]!.line}.`,
          }));
      });
    },
  }),
  defineRule({
    id: "ios/privacy-manifest", title: "Required privacy manifest", platform: "ios", severity: "error",
    policyUrl: privacyUrl, fix: "Add PrivacyInfo.xcprivacy to each bundle that uses required-reason APIs.",
    check(model) {
      if (model.privacy.length || !model.ios.length) return [];
      const uses = requiredApis.flatMap(({ pattern }) => sourceMatches(model, "ios", pattern));
      return uses.length ? [{ file: uses[0]!.file, message: "Required-reason API use detected, but no PrivacyInfo.xcprivacy was found." }] : [];
    },
  }),
  defineRule({
    id: "ios/privacy-schema", title: "Privacy manifest structure", platform: "ios", severity: "error",
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
    policyUrl: infoUrl, fix: "Set a numeric major.minor.patch version and a positive one-to-three-component release build number.",
    check: (model) => model.ios.flatMap((bundle) => {
      const issues = [];
      const unresolved = (value?: string) => value?.includes("$(");
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
    policyUrl: infoUrl, fix: "Align app and embedded extension versions and builds. Independently versioned apps may disable this rule.",
    check(model) {
      const mismatched = model.ios.filter((bundle) => {
        const versions = new Set(model.ios.filter((other) => other.project === bundle.project)
          .map((other) => `${other.version}/${other.build}`));
        return versions.size > 1;
      });
      return mismatched.map((bundle) => ({
        file: bundle.file, message: `${bundle.name} is ${bundle.version}/${bundle.build}; scanned targets have differing versions or builds.`,
      }));
    },
  }),
  defineRule({
    id: "ios/deprecated-apis", title: "Deprecated iOS APIs", platform: "ios", severity: "warning",
    policyUrl: "https://developer.apple.com/documentation/webkit/wkwebview",
    fix: "Replace UIWebView with WKWebView and UIAlertView/UIActionSheet with UIAlertController.",
    check: (model) => sourceMatches(model, "ios", /\b(?:UIWebView|UIAlertView|UIActionSheet)\b/)
      .map((match) => ({ ...match, message: `Deprecated iOS API: ${match.message}.` })),
  }),
];
