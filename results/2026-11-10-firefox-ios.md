# Firefox: iOS static scan evidence

[All scan evidence](./README.md)

| Report prepared | Berthlint | Configuration | Declared SDK | Declared Xcode |
| --- | --- | --- | --- | --- |
| 2026-11-10 | 0.1.0, local development source | Firefox (explicit) | 27.0 | Not supplied |

**Result: scan completed with 0 errors, 5 warnings and 2 notes.**
Zero errors does not mean full release compliance.

## Findings at a glance

| Rule | Errors | Warnings | Notes | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `system/analysis` | 0 | 3 | 0 | Missing metadata, external xcconfig and unresolved versions limit coverage. |
| `ios/transport-security` | 0 | 1 | 0 | ATS exceptions need contextual review. |
| `ios/usage-descriptions` | 0 | 1 | 0 | Possible photo-library permission use; runtime/API behavior needs review. |
| `ios/deployment-target-coverage` | 0 | 0 | 2 | Some deployment targets unresolved; Xcode range not checked. |

## What this demonstrates

Explicit custom archive configuration selection works across six eligible targets.
Unresolved versions are diagnosed rather than compared as literal values.
The repository also contains Focus; this capture scans only the Firefox app
subdirectory. Metadata and build-toolchain coverage remain incomplete.

## Reproduce

From the Berthlint checkout, replacing the placeholder with your clone location:

```sh
npm run dev -- /path/to/firefox-ios/firefox-ios --configuration Firefox --ios-sdk-version 27.0 --no-interactive
```

The source capture used the interactive SDK prompt. Input revisions and local
configuration contents were not recorded; see [provenance limitations](./README.md#provenance-and-limits).

## Captured CLI output

<details>
<summary>Expand full output</summary>

```text
npm run dev -- <projects>/firefox-ios/firefox-ios/ --configuration Firefox

> shipcheck@0.1.0 dev
> node src/cli.ts <projects>/firefox-ios/firefox-ios/ --configuration Firefox

Which iOS SDK will build this release? This is not the deployment target (e.g. 26.0; Enter to skip): 27.0
WARNING . [system/analysis]
  No ios store metadata found; store listing checks were not run.
  Fix: Add fastlane metadata or set metadata.ios in shipcheck.config.json.
  https://docs.fastlane.tools/

WARNING Client.xcodeproj/project.pbxproj [system/analysis]
  External xcconfig build settings are not evaluated for 6 target(s): WidgetKitExtension, NotificationService, ActionExtension, CredentialProvider, Client, ShareTo.
  Fix: Confirm the effective Release versions, permissions and Info.plist in Xcode.
  https://developer.apple.com/documentation/xcode/adding-a-build-configuration-file-to-your-project

WARNING Client.xcodeproj/project.pbxproj [system/analysis]
  Version or build is set by an unresolved variable for 6 target(s): WidgetKitExtension ($(APP_VERSION)/1), NotificationService ($(APP_VERSION)/1), ActionExtension ($(APP_VERSION)/1), CredentialProvider ($(APP_VERSION)/1), Client ($(APP_VERSION)/1), ShareTo ($(APP_VERSION)/1); version checks were skipped for these targets.
  Fix: Verify the effective release version and build number in Xcode or your CI build command.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Client/Info.plist [ios/transport-security]
  Client declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Client/Info.plist [ios/usage-descriptions]
  Client is missing NSPhotoLibraryUsageDescription; possible API use in Client/Frontend/Browser/BrowserViewController/Actions/WebContextMenuActionsProvider.swift:201.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

NOTE Client.xcodeproj/project.pbxproj [ios/deployment-target-coverage]
  deployment target missing or unresolved; deployment compatibility checks were skipped for 3 target(s): NotificationService, CredentialProvider, ShareTo.
  Fix: Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.
  https://developer.apple.com/support/xcode/

NOTE Client.xcodeproj/project.pbxproj [ios/deployment-target-coverage]
  no Xcode version declared; the Xcode deployment support range was not checked for 3 target(s): WidgetKitExtension, ActionExtension, Client.
  Fix: Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.
  https://developer.apple.com/support/xcode/

0 error(s), 5 warning(s), 2 note(s). Static checks do not guarantee store acceptance.
```

</details>