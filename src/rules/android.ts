import type { Rule } from "../types.ts";
import { array, object } from "../loaders/helpers.ts";
import { requirements } from "../requirements.ts";
import { defineRule, deprecatedMatches, sourceMatches } from "./helpers.ts";

const manifestUrl = "https://developer.android.com/guide/topics/manifest/manifest-intro";
const versionUrl = "https://developer.android.com/studio/publish/versioning";
const permissionUrl = "https://support.google.com/googleplay/android-developer/answer/9888170";

function permissions(manifest: Record<string, unknown>): Set<unknown> {
  return new Set([...array(manifest["uses-permission"]), ...array(manifest["uses-permission-sdk-23"])]
    .map((entry) => object(entry)["android:name"]));
}

export const androidRules: Rule[] = [
  defineRule({
    id: "android/target-sdk", title: "Google Play target API level", platform: "android", severity: "error",
    description: "New apps and updates must meet the published target API threshold for their device category. This is not the existing-app availability threshold.",
    policyUrl: requirements.sources.androidTarget,
    fix: "Set a literal targetSdk in the app module, or verify dynamic Gradle values manually. Select the correct androidDevice in config.",
    check: (model, context) => model.android.flatMap((app) => {
      const minimum = requirements.androidTarget[context.androidDevice];
      return app.targetSdk === undefined || app.targetSdk >= minimum ? [] : [{
        file: app.file, message: `targetSdk ${app.targetSdk} is below ${minimum} required for ${context.androidDevice} submissions since ${requirements.androidTarget.effectiveOn}.`,
      }];
    }),
  }),
  defineRule({
    id: "android/exported-components", title: "Explicit component exported values", platform: "android", severity: "error",
    description: "Android 12+ requires explicit exported values for components with intent filters. Source manifests are checked without evaluating manifest merging.",
    policyUrl: "https://developer.android.com/about/versions/12/behavior-changes-12#exported",
    fix: "Set android:exported explicitly; launcher components need true, internal components generally need false.",
    check: (model) => model.android.flatMap((app) => app.targetSdk !== undefined && app.targetSdk < 31 ? []
      : ["activity", "activity-alias", "service", "receiver"].flatMap((kind) =>
        array(object(app.manifest.application)[kind]).flatMap((entry) => {
          const component = object(entry);
          return component["intent-filter"] !== undefined && !["true", "false"].includes(String(component["android:exported"]))
            ? [{ file: app.manifestFile, message: `${kind} ${component["android:name"] ?? "(unnamed)"} has intent filters without a valid explicit android:exported.` }] : [];
        }))),
  }),
  defineRule({
    id: "android/version-code", title: "Valid Android version code", platform: "android", severity: "error",
    description: "Google Play requires a positive integer versionCode within its supported range. Dynamically computed values cannot be certified without Gradle.",
    policyUrl: versionUrl, fix: "Set versionCode to an integer from 1 to 2100000000 in the app module.",
    check: (model) => model.android.filter((app) => app.versionCode !== undefined
      && (!Number.isInteger(app.versionCode) || app.versionCode < 1 || app.versionCode > 2100000000))
      .map((app) => ({ file: app.file, message: `Invalid versionCode (${app.versionCode}).` })),
  }),
  defineRule({
    id: "android/version-increment", title: "Increasing Android version code", platform: "android", severity: "error",
    description: "An update must use a versionCode higher than the previous release. Comparison requires an explicit git tag or configured previous code.",
    policyUrl: versionUrl, fix: "Increase versionCode above the previous release. Set baselineTag or previousAndroidVersionCode to enable comparison.",
    check: (model) => model.android.filter((app) => app.previousVersionCode !== undefined
      && app.versionCode !== undefined && app.versionCode <= app.previousVersionCode)
      .map((app) => ({ file: app.file, message: `versionCode ${app.versionCode} must exceed previous release ${app.previousVersionCode}.` })),
  }),
  defineRule({
    id: "android/version-baseline", title: "Release comparison coverage", platform: "android", severity: "note",
    description: "Without a known previous release, a valid versionCode does not prove that an update can be accepted. No release tag is guessed automatically.",
    policyUrl: versionUrl, fix: "Set baselineTag to a git release tag, or set previousAndroidVersionCode in config.",
    check: (model) => model.android.filter((app) => app.previousVersionCode === undefined)
      .map((app) => ({ file: app.file, message: "No previous-release versionCode supplied; monotonic version checking was skipped." })),
  }),
  defineRule({
    id: "android/version-name", title: "Android release version name", platform: "android", severity: "warning",
    description: "A human-readable release version should not be empty or contain unresolved variables.",
    policyUrl: versionUrl, fix: "Set a nonempty versionName in the app module.",
    check: (model) => model.android.filter((app) => app.versionName !== undefined
      && (!app.versionName.trim() || app.versionName.includes("${")))
      .map((app) => ({ file: app.file, message: "Empty or unresolved versionName." })),
  }),
  defineRule({
    id: "android/sensitive-permissions", title: "Sensitive permission review", platform: "android", severity: "warning",
    description: "Selected restricted permissions can require Play declarations or special eligibility. Presence alone does not establish a policy violation.",
    policyUrl: permissionUrl, fix: "Remove unnecessary permissions and complete the applicable Play permission declarations.",
    check: (model) => model.android.flatMap((app) => [...permissions(app.manifest)]
      .filter((permission) => typeof permission === "string"
        && /\.(?:ACCESS_BACKGROUND_LOCATION|READ_SMS|SEND_SMS|READ_CALL_LOG|MANAGE_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES|REQUEST_INSTALL_PACKAGES)$/.test(permission))
      .map((permission) => ({ file: app.manifestFile, message: `${permission} may require a Play policy declaration or special eligibility.` }))),
  }),
  defineRule({
    id: "android/missing-permissions", title: "Potential missing Android permissions", platform: "android", severity: "warning",
    description: "Camera, recording and location API tokens are compared to declared permissions. Libraries, module ownership and merged manifests need manual review.",
    policyUrl: manifestUrl, fix: "Review source/module ownership and add the needed uses-permission declaration. Library manifests may supply it at merge time.",
    check: (model) => [
      { pattern: /\b(?:CameraManager|CameraX|Camera\.open)\b/, permission: "android.permission.CAMERA" },
      { pattern: /\b(?:FusedLocationProviderClient|requestLocationUpdates)\b/, permission: "android.permission.ACCESS_FINE_LOCATION" },
      { pattern: /\bMediaRecorder\b/, permission: "android.permission.RECORD_AUDIO" },
    ].flatMap(({ pattern, permission }) => {
      const uses = sourceMatches(model, "android", pattern);
      if (!uses.length) return [];
      return model.android.filter((app) => !permissions(app.manifest).has(permission))
        .map((app) => ({ file: app.manifestFile, message: `Possible ${permission} use in ${uses[0]!.file}; permission is not in this source manifest.` }));
    }),
  }),
  defineRule({
    id: "android/debuggable", title: "Non-debuggable release app", platform: "android", severity: "error",
    description: "A main manifest that explicitly enables debugging is unsuitable for a production release; debug settings belong in debug build variants.",
    policyUrl: manifestUrl, fix: "Remove android:debuggable=true from the main manifest; use debug build types instead.",
    check: (model) => model.android.filter((app) => String(object(app.manifest.application)["android:debuggable"]) === "true")
      .map((app) => ({ file: app.manifestFile, message: "Main manifest explicitly enables debugging." })),
  }),
  defineRule({
    id: "android/cleartext-traffic", title: "Cleartext traffic review", platform: "android", severity: "warning",
    description: "Globally allowing cleartext traffic exposes unencrypted requests. This does not inspect scoped network security configuration.",
    policyUrl: "https://developer.android.com/privacy-and-security/security-config",
    fix: "Prefer HTTPS and remove globally enabled cleartext traffic; review scoped network security configuration.",
    check: (model) => model.android.filter((app) => String(object(app.manifest.application)["android:usesCleartextTraffic"]) === "true")
      .map((app) => ({ file: app.manifestFile, message: "Main manifest allows cleartext network traffic." })),
  }),
  defineRule({
    id: "android/deprecated-apis", title: "Deprecated Android APIs", platform: "android", severity: "warning",
    description: "Selected legacy concurrency, fragment and activity-result APIs deserve migration review. Import-only lines are ignored, and each API is reported once per file at its first non-import occurrence. Source matching is heuristic, not compiler analysis.",
    policyUrl: "https://developer.android.com/reference/android/os/AsyncTask",
    fix: "Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.",
    check: (model) => deprecatedMatches(model, "android", /\b(?:AsyncTask|android\.app\.Fragment|startActivityForResult)\b/)
      .map((match) => ({
        ...match, message: `Deprecated Android API: ${match.message}.`,
        policyUrl: match.message === "startActivityForResult"
          ? "https://developer.android.com/training/basics/intents/result"
          : match.message === "android.app.Fragment" ? "https://developer.android.com/jetpack/androidx/releases/fragment"
            : "https://developer.android.com/reference/android/os/AsyncTask",
      })),
  }),
];
