# Material Files: Android static scan evidence

[All scan evidence](./README.md)

| Report prepared | Berthlint | Device class | Version baseline |
| --- | --- | --- | --- |
| 2026-11-10 | 0.1.0, local development source | Phone (default) | Not supplied |

**Result: scan completed with 0 errors, 19 warnings and 1 note.**
Policy eligibility and runtime behavior require contextual review.

## Findings at a glance

| Rule | Errors | Warnings | Notes | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `android/cleartext-traffic` | 0 | 1 | 0 | Main manifest allows cleartext; review intended network support. |
| `android/sensitive-permissions` | 0 | 3 | 0 | All-files access, package queries and installation need policy review. |
| `android/deprecated-apis` | 0 | 14 | 0 | Thirteen AsyncTask occurrences and one activity-result occurrence, deduplicated per API/file. |
| `metadata/completeness` | 0 | 1 | 0 | No local zh-CN screenshots; remote listing not inspected. |
| `android/version-baseline` | 0 | 0 | 1 | Monotonic version checking not performed. |

## What this demonstrates

The report covers native manifest policy, legacy API review and localized listing
coverage in one scan. Permission and network warnings are not automatic defects:
file-manager functionality may intentionally need these capabilities.

## Reproduce

From the Berthlint checkout, replacing the placeholder with your clone location:

```sh
npm run dev -- /path/to/MaterialFiles --no-interactive
```

Input revisions and local configuration contents were not recorded; see
[provenance limitations](./README.md#provenance-and-limits).

## Captured CLI output

<details>
<summary>Expand full output</summary>

```text
npm run dev -- <projects>/MaterialFiles/

> shipcheck@0.1.0 dev
> node src/cli.ts <projects>/MaterialFiles/

WARNING app/src/main/AndroidManifest.xml [android/cleartext-traffic]
  Main manifest allows cleartext network traffic.
  Fix: Prefer HTTPS and remove globally enabled cleartext traffic; review scoped network security configuration.
  https://developer.android.com/privacy-and-security/security-config

WARNING app/src/main/AndroidManifest.xml [android/sensitive-permissions]
  android.permission.MANAGE_EXTERNAL_STORAGE may require a Play policy declaration or special eligibility.
  Fix: Remove unnecessary permissions and complete the applicable Play permission declarations.
  https://support.google.com/googleplay/android-developer/answer/9888170

WARNING app/src/main/AndroidManifest.xml [android/sensitive-permissions]
  android.permission.QUERY_ALL_PACKAGES may require a Play policy declaration or special eligibility.
  Fix: Remove unnecessary permissions and complete the applicable Play permission declarations.
  https://support.google.com/googleplay/android-developer/answer/9888170

WARNING app/src/main/AndroidManifest.xml [android/sensitive-permissions]
  android.permission.REQUEST_INSTALL_PACKAGES may require a Play policy declaration or special eligibility.
  Fix: Remove unnecessary permissions and complete the applicable Play permission declarations.
  https://support.google.com/googleplay/android-developer/answer/9888170

WARNING app/src/main/java/me/zhanghai/android/files/app/AppInitializers.kt:65 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/filelist/FileListLiveData.kt:40 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/filelist/PathObserver.kt:26 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/filelist/SearchFileListLiveData.kt:36 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/apk/ApkInfoLiveData.kt:32 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/apk/PermissionListLiveData.kt:27 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/audio/AudioInfoLiveData.kt:32 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/checksum/ChecksumInfoLiveData.kt:32 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/FileLiveData.kt:37 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/image/ImageInfoLiveData.kt:38 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/permission/PrincipalListLiveData.kt:25 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/fileproperties/video/VideoInfoLiveData.kt:33 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/storage/LanSmbServerListLiveData.kt:43 [android/deprecated-apis]
  Deprecated Android API: AsyncTask.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/reference/android/os/AsyncTask

WARNING app/src/main/java/me/zhanghai/android/files/util/FragmentExtensions.kt:184 [android/deprecated-apis]
  Deprecated Android API: startActivityForResult.
  Fix: Migrate AsyncTask to lifecycle-aware concurrency, framework fragments to AndroidX, and activity results to the Activity Result API.
  https://developer.android.com/training/basics/intents/result

WARNING fastlane/metadata/android [metadata/completeness]
  android: no local screenshots for 1 locale(s): zh-CN. Remote listing values or intended store fallback were not checked.
  Fix: Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.
  https://support.google.com/googleplay/android-developer/answer/9859152

NOTE app/build.gradle [android/version-baseline]
  No previous-release versionCode supplied; monotonic version checking was skipped.
  Fix: Set baselineTag to a git release tag, or set previousAndroidVersionCode in config.
  https://developer.android.com/studio/publish/versioning

0 error(s), 19 warning(s), 1 note(s). Static checks do not guarantee store acceptance.
```

</details>