import type { Rule } from "../types.ts";
import { array, object } from "../loaders/helpers.ts";
import { requirements } from "../requirements.ts";
import { defineRule, sourceMatches } from "./helpers.ts";

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
    policyUrl: versionUrl, fix: "Set versionCode to an integer from 1 to 2100000000 in the app module.",
    check: (model) => model.android.filter((app) => app.versionCode !== undefined
      && (!Number.isInteger(app.versionCode) || app.versionCode < 1 || app.versionCode > 2100000000))
      .map((app) => ({ file: app.file, message: `Invalid versionCode (${app.versionCode}).` })),
  }),
  defineRule({
    id: "android/version-increment", title: "Increasing Android version code", platform: "android", severity: "error",
    policyUrl: versionUrl, fix: "Increase versionCode above the previous release. Set baselineTag or previousAndroidVersionCode to enable comparison.",
    check: (model) => model.android.filter((app) => app.previousVersionCode !== undefined
      && app.versionCode !== undefined && app.versionCode <= app.previousVersionCode)
      .map((app) => ({ file: app.file, message: `versionCode ${app.versionCode} must exceed previous release ${app.previousVersionCode}.` })),
  }),
  defineRule({
    id: "android/version-baseline", title: "Release comparison coverage", platform: "android", severity: "note",
    policyUrl: versionUrl, fix: "Set baselineTag to a git release tag, or set previousAndroidVersionCode in config.",
    check: (model) => model.android.filter((app) => app.previousVersionCode === undefined)
      .map((app) => ({ file: app.file, message: "No previous-release versionCode supplied; monotonic version checking was skipped." })),
  }),
  defineRule({
    id: "android/version-name", title: "Android release version name", platform: "android", severity: "warning",
    policyUrl: versionUrl, fix: "Set a nonempty versionName in the app module.",
    check: (model) => model.android.filter((app) => app.versionName !== undefined
      && (!app.versionName.trim() || app.versionName.includes("${")))
      .map((app) => ({ file: app.file, message: "Empty or unresolved versionName." })),
  }),
  defineRule({
    id: "android/sensitive-permissions", title: "Sensitive permission review", platform: "android", severity: "warning",
    policyUrl: permissionUrl, fix: "Remove unnecessary permissions and complete the applicable Play permission declarations.",
    check: (model) => model.android.flatMap((app) => [...permissions(app.manifest)]
      .filter((permission) => typeof permission === "string"
        && /\.(?:ACCESS_BACKGROUND_LOCATION|READ_SMS|SEND_SMS|READ_CALL_LOG|MANAGE_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES|REQUEST_INSTALL_PACKAGES)$/.test(permission))
      .map((permission) => ({ file: app.manifestFile, message: `${permission} may require a Play policy declaration or special eligibility.` }))),
  }),
  defineRule({
    id: "android/missing-permissions", title: "Potential missing Android permissions", platform: "android", severity: "warning",
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
    policyUrl: manifestUrl, fix: "Remove android:debuggable=true from the main manifest; use debug build types instead.",
    check: (model) => model.android.filter((app) => String(object(app.manifest.application)["android:debuggable"]) === "true")
      .map((app) => ({ file: app.manifestFile, message: "Main manifest explicitly enables debugging." })),
  }),
  defineRule({
    id: "android/cleartext-traffic", title: "Cleartext traffic review", platform: "android", severity: "warning",
    policyUrl: "https://developer.android.com/privacy-and-security/security-config",
    fix: "Prefer HTTPS and remove globally enabled cleartext traffic; review scoped network security configuration.",
    check: (model) => model.android.filter((app) => String(object(app.manifest.application)["android:usesCleartextTraffic"]) === "true")
      .map((app) => ({ file: app.manifestFile, message: "Main manifest allows cleartext network traffic." })),
  }),
  defineRule({
    id: "android/deprecated-apis", title: "Deprecated Android APIs", platform: "android", severity: "warning",
    policyUrl: "https://developer.android.com/reference/android/os/AsyncTask",
    fix: "Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.",
    check: (model) => sourceMatches(model, "android", /\b(?:AsyncTask|android\.app\.Fragment|startActivityForResult)\b/)
      .map((match) => ({ ...match, message: `Deprecated Android API: ${match.message}.` })),
  }),
];
