# Home Assistant: iOS static scan evidence

[All scan evidence](./README.md)

| Report prepared | Shipcheck | Configuration | Declared SDK | Declared Xcode |
| --- | --- | --- | --- | --- |
| 2026-11-10 | 0.1.0, local development source | Release (default) | 27.0 | Not supplied |

**Result: scan completed with 11 errors, 29 warnings and 2 notes.**
Scanner severity does not establish that the published app has these defects.

## Findings at a glance

| Rule | Errors | Warnings | Notes | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `metadata/lengths` | 4 | 0 | 0 | Keywords exceed 100 UTF-8 bytes: es-MX 103, ru 167, zh-Hans 127, zh-Hant 145. |
| `metadata/required-fields` | 6 | 0 | 0 | Present blank descriptions in fi, fr-FR, no, ru and sv; blank no keywords. |
| `ios/privacy-manifest` | 1 | 0 | 0 | No local manifest found despite API use; verify generated/bundled resources. |
| `metadata/completeness` | 0 | 1 | 0 | Missing local screenshots grouped across 13 locales. |
| `metadata/localizations` | 0 | 14 | 0 | Twelve promotional-text gaps and two release-note gaps; parity is advisory. |
| `system/analysis` | 0 | 2 | 0 | External xcconfig and unresolved versions across eight targets. |
| `ios/transport-security` | 0 | 7 | 0 | ATS exceptions need contextual review for user-hosted servers. |
| `ios/usage-descriptions` | 0 | 5 | 0 | One target-specific microphone warning and four unknown-ownership advisories. |
| `ios/deployment-target-coverage` | 0 | 0 | 2 | Unresolved deployment targets and undeclared Xcode limit coverage. |

## What this demonstrates

The scan distinguishes invalid present metadata from absent local assets, reports
byte-based keyword limits, and groups multi-target coverage gaps. API tokens and
source membership do not prove runtime permission requests. The microphone
warning and privacy finding need build/runtime review, not an upstream defect claim.

## Reproduce

From the Shipcheck checkout, replacing the placeholder with your clone location:

```sh
npm run dev -- /path/to/home-assistant-ios --ios-sdk-version 27.0 --no-interactive
```

The source capture used the interactive SDK prompt. Input revisions and local
configuration contents were not recorded; see [provenance limitations](./README.md#provenance-and-limits).

## Captured CLI output

<details>
<summary>Expand full output</summary>

```text
> shipcheck@0.1.0 dev
> node src/cli.ts <projects>/home-assistant-ios/

Which iOS SDK will build this release? This is not the deployment target (e.g. 26.0; Enter to skip): 27.0
ERROR fastlane/metadata/es-MX/keywords.txt [metadata/lengths]
  ios es-MX keywords: 103 bytes; maximum 100.
  Fix: Shorten the field to its store limit. Apple keywords use UTF-8 bytes; other fields use Unicode code points.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/fi/description.txt [metadata/required-fields]
  ios fi requires description (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/fr-FR/description.txt [metadata/required-fields]
  ios fr-FR requires description (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/no/description.txt [metadata/required-fields]
  ios no requires description (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/no/keywords.txt [metadata/required-fields]
  ios no requires keywords (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/ru/description.txt [metadata/required-fields]
  ios ru requires description (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/ru/keywords.txt [metadata/lengths]
  ios ru keywords: 167 bytes; maximum 100.
  Fix: Shorten the field to its store limit. Apple keywords use UTF-8 bytes; other fields use Unicode code points.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/sv/description.txt [metadata/required-fields]
  ios sv requires description (minimum 1).
  Fix: Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/zh-Hans/keywords.txt [metadata/lengths]
  ios zh-Hans keywords: 127 bytes; maximum 100.
  Fix: Shorten the field to its store limit. Apple keywords use UTF-8 bytes; other fields use Unicode code points.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR fastlane/metadata/zh-Hant/keywords.txt [metadata/lengths]
  ios zh-Hant keywords: 145 bytes; maximum 100.
  Fix: Shorten the field to its store limit. Apple keywords use UTF-8 bytes; other fields use Unicode code points.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

ERROR Sources/App/AppDelegate.swift [ios/privacy-manifest]
  Required-reason API use detected, but no PrivacyInfo.xcprivacy was found.
  Fix: Add PrivacyInfo.xcprivacy to each bundle that uses required-reason APIs.
  https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api

WARNING fastlane/metadata [metadata/completeness]
  ios: no local screenshots for 13 locale(s): de-DE, en-US, es-ES, es-MX, fi, fr-FR, it, nl-NL, no, ru, sv, zh-Hans, zh-Hant. Remote listing values or intended store fallback were not checked.
  Fix: Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/de-DE [metadata/localizations]
  de-DE is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/es-ES [metadata/localizations]
  es-ES is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/es-MX [metadata/localizations]
  es-MX is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/fi [metadata/localizations]
  fi is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/fr-FR [metadata/localizations]
  fr-FR is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/it [metadata/localizations]
  it is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/nl-NL [metadata/localizations]
  nl-NL is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/no [metadata/localizations]
  no is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/no [metadata/localizations]
  no is missing release_notes present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/ru [metadata/localizations]
  ru is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/ru [metadata/localizations]
  ru is missing release_notes present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/sv [metadata/localizations]
  sv is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/zh-Hans [metadata/localizations]
  zh-Hans is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING fastlane/metadata/zh-Hant [metadata/localizations]
  zh-Hant is missing promotional_text present in en-US.
  Fix: Provide the default locale and translate fields present in it; review intended store fallback behavior.
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

WARNING HomeAssistant.xcodeproj/project.pbxproj [system/analysis]
  External xcconfig build settings are not evaluated for 8 target(s): Extensions-Share, Extensions-Widgets, Extensions-Matter, Extensions-PushProvider, Extensions-NotificationContent, App, Extensions-Intents, Extensions-NotificationService.
  Fix: Confirm the effective Release versions, permissions and Info.plist in Xcode.
  https://developer.apple.com/documentation/xcode/adding-a-build-configuration-file-to-your-project

WARNING HomeAssistant.xcodeproj/project.pbxproj [system/analysis]
  Version or build is set by an unresolved variable for 8 target(s): Extensions-Share ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-Widgets ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-Matter ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-PushProvider ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-NotificationContent ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), App ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-Intents ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)), Extensions-NotificationService ($(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION)); version checks were skipped for these targets.
  Fix: Verify the effective release version and build number in Xcode or your CI build command.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Sources/App/Resources/Info.plist [ios/transport-security]
  App declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/Intents/Resources/Info.plist [ios/transport-security]
  Extensions-Intents declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/Matter/Resources/Info.plist [ios/transport-security]
  Extensions-Matter declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/NotificationContent/Resources/Info.plist [ios/transport-security]
  Extensions-NotificationContent declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/NotificationContent/Resources/Info.plist [ios/usage-descriptions]
  Extensions-NotificationContent is missing NSMicrophoneUsageDescription; possible API use in Sources/App/Cameras/CameraPlayer/WebRTC/WebRTCMicrophonePermission.swift:7.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Sources/Extensions/NotificationService/Resources/Info.plist [ios/transport-security]
  Extensions-NotificationService declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/PushProvider/Resources/Info.plist [ios/transport-security]
  Extensions-PushProvider declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/Extensions/Widgets/Resources/Info.plist [ios/transport-security]
  Extensions-Widgets declares ATS exceptions.
  Fix: Remove broad ATS exceptions; document and justify any required domain exceptions for App Review.
  https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

WARNING Sources/HADesignSystem/Sources/Components/HACameraPreview.swift [ios/usage-descriptions]
  Possible API use requiring NSCameraUsageDescription in Sources/HADesignSystem/Sources/Components/HACameraPreview.swift:59; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Sources/Shared/Environment/Environment.swift [ios/usage-descriptions]
  Possible API use requiring NSBluetoothAlwaysUsageDescription in Sources/Shared/Environment/Environment.swift:855; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Sources/Shared/LocationManager.swift [ios/usage-descriptions]
  Possible API use requiring NSLocationAlwaysAndWhenInUseUsageDescription in Sources/Shared/LocationManager.swift:331; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

WARNING Sources/Shared/LocationManager.swift [ios/usage-descriptions]
  Possible API use requiring NSLocationWhenInUseUsageDescription in Sources/Shared/LocationManager.swift:288; target ownership is unknown. Review linked packages and the consuming target's usage string; no missing string is asserted for unrelated targets.
  Fix: Add meaningful usage descriptions to the relevant target's Info.plist; verify API use and target membership.
  https://developer.apple.com/documentation/bundleresources/information-property-list

NOTE HomeAssistant.xcodeproj/project.pbxproj [ios/deployment-target-coverage]
  deployment target missing or unresolved; deployment compatibility checks were skipped for 3 target(s): Extensions-Share, App, Extensions-NotificationService.
  Fix: Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.
  https://developer.apple.com/support/xcode/

NOTE HomeAssistant.xcodeproj/project.pbxproj [ios/deployment-target-coverage]
  no Xcode version declared; the Xcode deployment support range was not checked for 5 target(s): Extensions-Widgets, Extensions-Matter, Extensions-PushProvider, Extensions-NotificationContent, Extensions-Intents.
  Fix: Declare xcodeVersion (or --xcode-version) for a documented family. Resolve IPHONEOS_DEPLOYMENT_TARGET using Xcode build settings; standalone plists may supply MinimumOSVersion.
  https://developer.apple.com/support/xcode/

11 error(s), 29 warning(s), 2 note(s). Static checks do not guarantee store acceptance.
```

</details>