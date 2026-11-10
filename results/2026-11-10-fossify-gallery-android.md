# Fossify Gallery: Android static scan evidence

[All scan evidence](./README.md)

| Report prepared | Shipcheck | Device class | Version baseline |
| --- | --- | --- | --- |
| 2026-11-10 | 0.1.0, local development source | Phone (default) | Not supplied |

**Result: scan completed with 0 errors, 10 warnings and 1 note.**
Zero errors does not establish Play eligibility or final variant compliance.

## Findings at a glance

| Rule | Errors | Warnings | Notes | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `system/analysis` | 0 | 1 | 0 | Variant/output overrides need built-release verification. |
| `android/sensitive-permissions` | 0 | 1 | 0 | All-files access may require policy eligibility/declarations. |
| `android/deprecated-apis` | 0 | 5 | 0 | Four activity-result occurrences and one AsyncTask occurrence, deduplicated per API/file. |
| `metadata/completeness` | 0 | 3 | 0 | Missing descriptions, titles and screenshots grouped by field and locale. |
| `android/version-baseline` | 0 | 0 | 1 | Monotonic version checking not performed. |

## What this demonstrates

The scanner handles the project's Gradle declarations without a module-loading
failure and reports unsupported variant overrides explicitly. Local listing gaps
are advisories, not allegations about the remote listing. The capture does not
print resolved SDK/version values; it is not evidence of their exact values.

## Reproduce

From the Shipcheck checkout, replacing the placeholder with your clone location:

```sh
npm run dev -- /path/to/FossifyOrg-Gallery --no-interactive
```

Input revisions and local configuration contents were not recorded; see
[provenance limitations](./README.md#provenance-and-limits).

## Captured CLI output

<details>
<summary>Expand full output</summary>

```text
> shipcheck@0.1.0 dev
> node src/cli.ts <projects>/FossifyOrg-Gallery/

WARNING app/build.gradle.kts [system/analysis]
  Gradle variants or version overrides detected; only literal defaults are inspected.
  Fix: Verify the final release variant in Gradle; this tool does not evaluate build scripts.
  https://developer.android.com/build/build-variants

WARNING app/src/main/AndroidManifest.xml [android/sensitive-permissions]
  android.permission.MANAGE_EXTERNAL_STORAGE may require a Play policy declaration or special eligibility.
  Fix: Remove unnecessary permissions and complete the applicable Play permission declarations.
  https://support.google.com/googleplay/android-developer/answer/9888170

WARNING app/src/main/kotlin/org/fossify/gallery/activities/MainActivity.kt:1085 [android/deprecated-apis]
  Deprecated Android API: startActivityForResult.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/training/basics/intents/result

WARNING app/src/main/kotlin/org/fossify/gallery/activities/SettingsActivity.kt:802 [android/deprecated-apis]
  Deprecated Android API: startActivityForResult.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/training/basics/intents/result

WARNING app/src/main/kotlin/org/fossify/gallery/activities/SetWallpaperActivity.kt:56 [android/deprecated-apis]
  Deprecated Android API: startActivityForResult.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/training/basics/intents/result

WARNING app/src/main/kotlin/org/fossify/gallery/activities/ViewPagerActivity.kt:1462 [android/deprecated-apis]
  Deprecated Android API: startActivityForResult.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/training/basics/intents/result

WARNING app/src/main/kotlin/org/fossify/gallery/asynctasks/GetMediaAsynctask.kt:19 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING fastlane/metadata/android [metadata/completeness]
  android: no local full_description for 2 locale(s): eo, ja-JP. Remote listing values or intended store fallback were not checked.
  Fix: Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.
  https://support.google.com/googleplay/android-developer/answer/9859152

WARNING fastlane/metadata/android [metadata/completeness]
  android: no local screenshots for 29 locale(s): bg, ca, cs-CZ, de-DE, eo, es-ES, et, eu-ES, fr-FR, ga, gl-ES, hi-IN, hr, hu-HU, id, it-IT, iw-IL, ja-JP, nl-NL, pl-PL, pt, pt-BR, ru-RU, sv-SE, tr-TR, uk, zh-CN, zh-HK, zh-TW. Remote listing values or intended store fallback were not checked.
  Fix: Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.
  https://support.google.com/googleplay/android-developer/answer/9859152

WARNING fastlane/metadata/android [metadata/completeness]
  android: no local title for 29 locale(s): bg, ca, cs-CZ, de-DE, eo, es-ES, et, eu-ES, fr-FR, ga, gl-ES, hi-IN, hr, hu-HU, id, it-IT, iw-IL, ja-JP, nl-NL, pl-PL, pt, pt-BR, ru-RU, sv-SE, tr-TR, uk, zh-CN, zh-HK, zh-TW. Remote listing values or intended store fallback were not checked.
  Fix: Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.
  https://support.google.com/googleplay/android-developer/answer/9859152

NOTE app/build.gradle.kts [android/version-baseline]
  No previous-release versionCode supplied; monotonic version checking was skipped.
  Fix: Set baselineTag to a git release tag, or set previousAndroidVersionCode in config.
  https://developer.android.com/studio/publish/versioning

0 error(s), 10 warning(s), 1 note(s). Static checks do not guarantee store acceptance.
```

</details>