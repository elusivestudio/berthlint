# shipcheck

Static release checks for native iOS and Android apps and fastlane store listings.
Find avoidable release problems **before building or uploading**. No store credentials,
Xcode, Android SDK, or network access are needed to run checks.

**Initial release:** 27 built-in rules, extensible with trusted JavaScript plugins.
This project has not been published to npm.

## Get started

Requires Node.js **22.18+** (Node 24 LTS recommended) and npm.

```sh
npm install
npm run build
node dist/cli.js /path/to/mobile-app
```

For development, TypeScript runs directly on Node:

```sh
npm run dev -- /path/to/mobile-app --strict
npm run check
```

From a checkout, install the CLI locally with `npm link`, then run `shipcheck`
inside a mobile repository. `npm pack` creates an installable package.
The package is prepared for `npx shipcheck` once published; that command does not
currently refer to this unpublished checkout.

## CLI

```sh
shipcheck . --platform ios
shipcheck . --format json
shipcheck . --format sarif --output shipcheck.sarif
shipcheck . --format github --strict
shipcheck . --config config/release.json
shipcheck --list-rules
```

| Option | Default | Description |
| --- | --- | --- |
| `--platform` | `all` | `ios`, `android`, or `all`; excludes the other platform's native loaders and metadata |
| `--format` | `text` | `text`, `json`, `sarif` (2.1.0), or `github` workflow annotations |
| `--output` | stdout | Report file, relative to the current working directory |
| `--config` | `shipcheck.config.json` | Config path relative to the scanned project |
| `--strict` | false | Treat warnings as CI failures |
| `--list-rules` | false | List rules, default severities and titles without scanning |

Exit codes: **0** no errors, **1** validation errors (or warnings in strict mode),
**2** execution failure, including malformed inputs, unknown rules, broken plugins
and unsupported/empty projects. Execution failures go to stderr, not into a
success-shaped JSON report. Notes never cause a failure.

JSON output is `{ schemaVersion: 1, findings: [...], summary: { error, warning, note } }`.
Each finding includes a stable `ruleId`, severity, project-relative file, optional
1-based source line, message, fix suggestion and policy URL. Findings are sorted
deterministically. No report format claims that a clean scan guarantees acceptance.

## Recognized layouts

```text
mobile-app/
  App.xcodeproj/project.pbxproj
  App/Info.plist
  App/PrivacyInfo.xcprivacy
  App/*.swift
  app/build.gradle.kts
  app/src/main/AndroidManifest.xml
  app/src/main/**/*.kt
  fastlane/
    metadata/
      en-US/name.txt
      en-US/subtitle.txt
      en-US/keywords.txt
      en-US/description.txt
      en-US/promotional_text.txt
      en-US/release_notes.txt
      android/en-US/title.txt
      android/en-US/short_description.txt
      android/en-US/full_description.txt
      android/en-US/images/phoneScreenshots/*.png
      android/en-US/images/sevenInchScreenshots/*.png
    screenshots/en-US/*.png
```

Native files are discovered recursively. Platform-specific `ios/fastlane/...` and
`android/fastlane/...` layouts also work. Standalone `Info.plist` and root
`AndroidManifest.xml` are supported for simple projects. When an Xcode project is
present, only its application and app-extension targets are loaded, not unrelated
test or framework plists. iOS locale-local `screenshots/` directories are also read.

Dependency/build directories (`Pods`, `Carthage`, `node_modules`, `build`, `dist`,
`DerivedData`, `.gradle`, `.build`, `vendor`, `.swiftpm`, `coverage`) and symlinks are
not traversed. Only XML plists are supported, not binary plists. PNG/JPEG screenshot
headers are read without decoding the image; corruption beyond the headers and
alpha channels are not checked.

Native projects without discovered store metadata produce a coverage warning.
Empty locale folders produce missing-field findings instead of a clean scan.
One final line ending and a leading UTF-8 BOM are removed from metadata; other
whitespace is retained for length checks.

## Configuration

All properties are optional; unknown properties and rule IDs are errors.

```json
{
  "defaultLocale": "en-US",
  "configuration": "Release",
  "androidDevice": "phone",
  "metadata": {
    "ios": "fastlane/metadata",
    "android": "fastlane/metadata/android"
  },
  "screenshots": {
    "ios": "fastlane/screenshots"
  },
  "previousAndroidVersionCode": 41,
  "plugins": ["./tools/release-rules.mjs"],
  "rules": {
    "ios/transport-security": "warning",
    "ios/deprecated-apis": "off",
    "metadata/localizations": { "severity": "error" }
  }
}
```

Paths are relative to the scanned project. `androidDevice` accepts `phone`, `wear`,
`automotive`, `tv` and `xr`; it selects the published **submission/update** target
SDK minimum, not the existing-app availability threshold. Non-phone screenshot
checks are explicitly skipped with a coverage warning.

For a reproducible git release comparison, set `"baselineTag": "v1.2.0"` instead
of `previousAndroidVersionCode`. Shipcheck reads each module's Gradle file at that
tag without checking it out. If both are set, `baselineTag` takes precedence.
Missing tags, missing baseline files or unresolved baseline versions are execution
errors. No tag is guessed automatically: a marketing version tag alone does not
reveal Android's build number. Without a baseline, a note reports the skipped check.

Rule values are `off`, `error`, `warning`, or `note`, either directly or in a
`{ "severity": ... }` object. `system/analysis` controls loader coverage diagnostics.

## Checks

Every rule includes a default severity, remediation and official policy/help link.
Warnings identify review work or heuristics, not certain store rejections.

| Rule | Default | Checks |
| --- | --- | --- |
| `ios/usage-descriptions` | warning | Camera, microphone, location, photos, contacts, speech and Bluetooth API hints vs usage strings |
| `ios/privacy-manifest` | error | Missing manifest when a supported required-reason API is detected |
| `ios/privacy-schema` | error | Privacy field types, required-reason entries, reason-code syntax, collected-data entry completeness and tracking domains |
| `ios/required-reasons` | warning | Detected API categories without a declared nonempty reason |
| `ios/transport-security` | warning | Broad ATS bypasses and domain exceptions |
| `ios/version-format` | error | Resolved release marketing version and build-number format |
| `ios/version-consistency` | warning | Version/build mismatches among app/extension targets in the same project |
| `ios/deprecated-apis` | warning | `UIWebView`, `UIAlertView`, `UIActionSheet` |
| `android/target-sdk` | error | Device-specific Play submission target API minimum; unresolved values are reported |
| `android/exported-components` | error | Explicit exported values on activities, aliases, services and receivers with intent filters at target 31+ |
| `android/version-code` | error | Literal integer from 1 through 2100000000 |
| `android/version-increment` | error | Code strictly higher than the supplied previous release |
| `android/version-baseline` | note | Missing prior-release comparison coverage |
| `android/version-name` | warning | Nonempty, statically resolved version name |
| `android/sensitive-permissions` | warning | Selected SMS, call-log, background-location, package and storage permissions |
| `android/missing-permissions` | warning | Camera, microphone and location API hints vs source manifest declarations |
| `android/debuggable` | error | Debugging explicitly enabled in the main manifest |
| `android/cleartext-traffic` | warning | Cleartext traffic explicitly enabled |
| `android/deprecated-apis` | warning | `AsyncTask`, framework `Fragment`, `startActivityForResult` |
| `metadata/lengths` | error | iOS name/subtitle/keywords/description/promotional text/release notes and Android title/short/full description |
| `metadata/required-fields` | error | Missing/blank mandatory listing fields and minimum iOS name length |
| `metadata/localizations` | warning | Default locale presence and field parity |
| `metadata/screenshot-dimensions` | error | Known iPhone/iPad sizes, Play phone/tablet 320–3840 px and maximum 2:1 aspect ratio |
| `metadata/screenshot-counts` | error | iOS 1+ screenshots / maximum 10 per display group; Android 2+ total / maximum 8 per device group |
| `metadata/ios-required-screenshots` | warning | Current/scalable iPhone groups and 13-inch iPad assets where iPad support is known |
| `system/requirements-stale` | warning | Policy data older than its 180-day review window |
| `system/specialized-android-store` | warning | Unsupported device-specific screenshot coverage |

iOS keywords are measured in **UTF-8 bytes**, not JavaScript string length.
Other text limits count Unicode code points; store-side counting of complex
graphemes may differ.

## Architecture and plugin API

```text
filesystem -> project loaders -> normalized ProjectModel -> pure rules -> reporters
                                   ^
                           versioned policy JSON
```

Built-in rules never read the filesystem. The exported model, rule types, loaders,
engine, reporters and requirements data can also be used programmatically.

A plugin is an ESM or CommonJS package, or a local JavaScript module, exporting
`{ rules: Rule[] }` as its default export or exporting a named `rules` array.
Package resolution is relative to the scanned project and honors ESM exports.

```js
// tools/release-rules.mjs
/** @type {import("shipcheck").ShipcheckPlugin} */
export default {
  rules: [{
    id: "team/support-url",
    title: "Support URL checklist",
    platform: "ios",
    severity: "warning",
    policyUrl: "https://developer.apple.com/app-store/review/guidelines/",
    fix: "Confirm the support URL works before submission.",
    check(model) {
      return model.ios.map(bundle => ({
        file: bundle.file,
        message: "Manually verify the published support URL."
      }));
    }
  }]
};
```

Rule IDs are namespaced (`namespace/kebab-case`). `check(model, context)` is
synchronous and returns `{ file, line?, message, policyUrl? }[]`; context contains the default
locale, Android device category and current date. The engine supplies severity,
policy URL and remediation from the rule metadata. A result can override the
policy URL when a cross-platform rule needs a store-specific link. Throwing rules, malformed
findings and duplicate IDs fail explicitly.

**Plugins execute with the user's full permissions. They are not sandboxed.**
Only enable trusted packages, especially when scanning untrusted pull requests.
Treat the model as read-only and keep checks deterministic and filesystem-free.

## CI

Run the built CLI directly in any CI with Node 22.18+.

The included [composite action](./action.yml) builds this checkout and emits GitHub
annotations. After checking out Shipcheck into a `tools/shipcheck` subdirectory:

```yaml
- uses: ./tools/shipcheck
  with:
    path: .
    strict: "true"
    platform: all
```

Alternatively run `node /path/to/shipcheck/dist/cli.js . --format sarif --output
shipcheck.sarif` and upload with `github/codeql-action/upload-sarif` using
`sarif_file: shipcheck.sarif` and `security-events: write` permissions.
Run the upload step with `if: always()` because validation findings return 1.
SARIF paths are relative to the scanned project; set the upload action's
`checkout_path` accordingly if scanning a subdirectory.

Repository CI runs strict source/test type-checking, tests, compilation and a
package-content check on Node 22 and 24. A weekly workflow fails when the
requirements review date is overdue; it does not automatically change policies.

## Policy data and limitations

Store limits live in [versioned JSON](./src/requirements/store.v1.json), with a
`verifiedOn` date and official source URLs. Baseline verified **2026-11-09**.
Review the linked sources before relying on a release decision. A future policy
change needs a data/rule update; runtime validation never fetches policy changes.

This is static triage, **not an App Review replacement**:

- Gradle is not executed. Literal Groovy/Kotlin settings work; version catalogs,
  arbitrary variables, arithmetic, plugins and manifest merging are not evaluated.
  Detected flavors/overrides produce a coverage warning. Libraries can contribute
  permissions or components that are absent from the source app manifest.
- Xcode's selected configuration and directly inherited project settings are
  inspected. Referenced xcconfig files produce a warning; nested variables,
  conditional settings, localized usage strings and build-generated values may
  remain unresolved. Xcode/SDK upload requirements and deployment compatibility
  cannot be certified without examining the actual build environment/artifact.
- Source scanning is a conservative token heuristic, not compiler analysis. It
  excludes ordinary comments but may flag strings or inactive code. It does not
  reconstruct target membership. API usage is compared against scanned native
  targets, so manually verify which target owns the code.
- Privacy coverage is compared across discovered manifests, not executable bundle
  membership. A declaration in a sibling target does **not** prove compliance.
  Reason-code syntax and category presence are checked, not whether Apple approves
  that code for the category or whether the claimed reason is truthful. Third-party
  SDK privacy practices and manifests require independent review.
- Metadata/localization completeness checks are intentionally stricter than store
  fallback behavior. Disable/tune them when a deliberate localization fallback is
  part of your release process. Existing listings may already contain missing assets.
- Screenshot checks cover iPhone/iPad and Android phone/tablet listing images,
  not videos, icons, image content, alpha, watch/TV/XR assets or all scaling rules.
- Built `.ipa`/`.aab` files, uploading, credentials, React Native/Flutter-specific
  layouts and exhaustive deprecated-API analysis are outside this first release.

## Contributing

Add pure rules under [src/rules](./src/rules), export them in the rule registry,
and include passing/failing cases and exact boundary tests. Native parser changes
belong in [src/loaders](./src/loaders), with representative fixtures under
[test/fixtures](./test/fixtures). Policy changes need source verification and a
review-date update, not just a changed constant. Run `npm run check` before
submitting changes.

MIT licensed.
