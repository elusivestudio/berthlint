# Ice Cubes: iOS static scan evidence

[All scan evidence](./README.md)

| Report prepared | Shipcheck | Configuration | Declared SDK | Declared Xcode |
| --- | --- | --- | --- | --- |
| 2026-11-10 | 0.1.0, local development source | Release (default) | 27.0 | Not supplied |

**Result: scan completed with 1 error, 4 warnings and 1 note.**
These are scanner severities, not confirmed store rejection decisions.

## Findings at a glance

| Rule | Errors | Warnings | Notes | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `ios/privacy-manifest` | 1 | 0 | 0 | No local manifest found despite detected API use; verify build-generated resources. |
| `system/analysis` | 0 | 2 | 0 | Listing metadata absent; external xcconfig settings not evaluated. |
| `ios/usage-descriptions` | 0 | 2 | 0 | Package ownership needs review; no missing strings asserted against unrelated extensions. |
| `ios/deployment-target-coverage` | 0 | 0 | 1 | Xcode deployment support range not checked. |

## What this demonstrates

The report groups coverage for five targets and separates unknown package ownership
from target-specific permission allegations. It does not certify the built archive,
remote listing, or privacy-manifest bundle membership.

## Reproduce

From the Shipcheck checkout, replacing the placeholder with your clone location:

```sh
npm run dev -- /path/to/IceCubesApp --ios-sdk-version 27.0 --no-interactive
```

The source capture used the interactive SDK prompt. Input revisions and local
configuration contents were not recorded; see [provenance limitations](./README.md#provenance-and-limits).

## Captured CLI output

<details>
<summary>Expand full output</summary>

```text
npm run dev -- <projects>/IceCubesApp

> shipcheck@0.1.0 dev
> node src/cli.ts <projects>/IceCubesApp

Which iOS SDK will build this release? This is not the deployment target (e.g. 26.0; Enter to skip): 27.0
ERROR IceCubesApp/App/Main/IceCubesApp.swift [ios/privacy-manifest]
  Required-reason API use detected, but no PrivacyInfo.xcprivacy was found.
  Fix: Add PrivacyInfo.xcprivacy to each bundle that uses required-reason APIs.
  https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api

WARNING . [system/analysis]
  No ios store metadata found; store listing checks were not run.
  Fix: Add fastlane metadata or set metadata.ios in shipcheck.config.json.
  https://docs.fastlane.tools/

WARNING IceCubesApp.xcodeproj/project.pbxproj [system/analysis]
  External xcconfig build settings are not evaluated for 5 target(s): IceCubesNotifications, IceCubesAppWidgetsExtensionExtension, IceCubesShareExtension, IceCubesApp, IceCubesActionExtension.
  Fix: Confirm the effective Release versions, permissions and Info.plist in Xcode.
  https://developer.apple.com/documentation/xcode/adding-a-build-configuration-file-to-your-project

WARNING Packages/MediaUI/Sources/MediaUI/MediaUIView.swift [ios/usage-descriptions]
  Possible API use requiring NSPhotoLibraryUsageDescription in Packages/MediaUI/Sources/MediaUI/MediaUIView.swift:197; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Packages/StatusKit/Sources/StatusKit/Editor/Components/CameraPickerView.swift [ios/usage-descriptions]
  Possible API use requiring NSCameraUsageDescription in Packages/StatusKit/Sources/StatusKit/Editor/Components/CameraPickerView.swift:17; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

NOTE IceCubesApp.xcodeproj/project.pbxproj [ios/deployment-target-coverage]
  no Xcode version declared; the Xcode deployment support range was not checked for 5 target(s): IceCubesNotifications, IceCubesAppWidgetsExtensionExtension, IceCubesShareExtension, IceCubesApp, IceCubesActionExtension.
  Fix: Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.
  https://developer.apple.com/support/xcode/

1 error(s), 4 warning(s), 1 note(s). Static checks do not guarantee store acceptance.
```

</details>