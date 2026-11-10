# Policy data and limitations

Store limits live in the [versioned policy data](https://raw.githubusercontent.com/elusivestudio/berthlint/main/src/requirements/store.v1.json),
which records a `verifiedOn` date and official source URLs. The runtime does not
fetch policy changes. Review current official sources before relying on a
release decision.

## Verified Apple requirements

- Since September 9, 2026, iOS and iPadOS apps uploaded to App Store Connect must
  target iOS 13 or later. See Apple's [minimum system requirements notice](https://developer.apple.com/news/upcoming-requirements/?id=0992026a).
- Since April 28, 2026, uploads must use Xcode 26 or later and an iOS 26 SDK or
  later. See Apple's [SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).
- Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
  state that from April 2027, screenshots are required for apps using the iOS
  27.1 SDK or later. Berthlint recognizes iPhone Duo dimensions but does not yet
  enforce the future SDK-dependent requirement.

## Xcode deployment support

The Xcode Support page is the official source for compatible platforms and
deployment targets. In the 2026-11-10 review, the page content available did not
provide deployment-range rows for Xcode 26 or 27, so this policy snapshot does
not assert an iOS 15 floor for those families. Berthlint does not enforce that
unverified floor and instead emits a deployment-coverage note when a family has
no verified support range. Re-verify the live [Xcode Support](https://developer.apple.com/support/xcode/)
page before adding Xcode-family floors to the policy data.

The build SDK and deployment target are different. An app can be built with the
iOS 26 SDK while supporting an earlier iOS version. Berthlint compares the
declared SDK and optional Xcode release against dated upload requirements. These
inputs describe the intended build; they do not prove which SDK or Xcode built
an archive. `SDKROOT = iphoneos` and project migration markers are not used to
guess versions.

If a native iOS app is found and no SDK is supplied, Berthlint prompts only for
a text scan with stdin, stdout and stderr attached to terminals, no `--output`,
no nonempty `CI` environment variable, and no `--no-interactive`. Disabling
`ios/sdk-requirements` also disables the prompt. Enter skips it; an invalid
nonempty answer is an execution error. JSON, SARIF, GitHub annotations,
redirected output, Android-only scans and CI never prompt. Missing SDK
information produces a nonblocking coverage note.

Deployment targets come from the selected Xcode configuration (target settings
override project settings), or `MinimumOSVersion` in standalone plists. They are
checked for numeric format, the dated App Store deployment minimum, and against
the declared SDK. Missing or unresolved targets and unknown Xcode support
produce coverage notes. Referenced xcconfig files and build-command overrides
still require manual verification.

## Gradle and project resolution

Gradle is not executed. Literal Groovy/Kotlin settings and supported default
version-catalog/property references are resolved statically. Supported
assignment-form examples include `libs.versions.app.targetSdk.get().toInt()`
and `project.property("VERSION_CODE").toString().toInt()`; string values may
omit `.toInt()`. Simple single-line `val` aliases and catalog
application-plugin aliases are supported.

Only root `gradle/libs.versions.toml` and `gradle.properties` are read. Custom
catalogs, providers, environment values, arbitrary variables, arithmetic,
plugin execution and manifest merging are not evaluated. Unsupported declared
values remain unresolved with diagnostics rather than silently falling back to
manifest values. Historical version comparisons read shared values from the
baseline tag, not today's files. Detected flavors or overrides produce a
coverage warning. Libraries can contribute permissions or components that are
absent from the source app manifest.

## Static-analysis limits

- Dependency/build directories (`Pods`, `Carthage`, `node_modules`, `build`,
  `dist`, `DerivedData`, `.gradle`, `.build`, `vendor`, `.swiftpm`, `coverage`)
  and symlinks are not traversed. Only XML plists are supported, not binary
  plists.
- Xcode settings are read statically; nested variables, conditional settings,
  xcconfig files, localized usage strings and build-generated values may remain
  unresolved. Toolchain inputs are declarations, not proof of the actual build
  environment or artifact.
- Source scanning is a conservative token heuristic, not compiler analysis. It
  excludes ordinary comments but may flag strings or inactive code. Direct
  Xcode source membership is inspected, but package dependency reachability and
  conditional compilation are not reconstructed. Unmapped usage requires
  review.
- Privacy coverage is compared across discovered manifests, not executable
  bundle membership. A declaration in a sibling target does not prove
  compliance. Reason-code syntax and category presence are checked, not whether
  Apple approves a reason or whether it is truthful. Third-party SDK privacy
  practices and manifests require independent review.
- Metadata/localization completeness is advisory by default. Remote listing
  state and deliberate locale fallback are not inspected.
- Screenshot checks inspect PNG/JPEG headers without decoding image content.
  Corruption beyond the headers and alpha channels are not checked. Checks cover
  iPhone/iPad and Android phone/tablet listing images, not videos, icons, image
  content, watch/TV/XR assets or every scaling rule.
- Built `.ipa`/`.aab` files, uploading, credentials, React Native/Flutter-specific
  layouts and exhaustive deprecated-API analysis are outside the current scope.

Berthlint is an independent project, not affiliated with or endorsed by Apple
Inc. or Google LLC. App Store and Google Play names belong to their respective
owners.
