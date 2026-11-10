# Usage

Berthlint requires Node.js 22.18 or later. From the project directory:

```sh
npx berthlint@0.1.3 .
berthlint . --platform ios
berthlint . --format json
berthlint . --format sarif --output berthlint.sarif
berthlint . --format github --strict
berthlint . --no-interactive --no-plugins
berthlint --list-rules
```

Install an exact package version and commit the lockfile for CI:

```sh
npm install --save-dev --save-exact berthlint@0.1.3
npm ci --include=dev
npx --no-install berthlint . --strict --no-interactive --no-plugins
```

## CLI options and reports

| Option | Default | Description |
| --- | --- | --- |
| `--platform` | `all` | `ios`, `android`, or `all` |
| `--format` | `text` | `text`, `json`, `sarif` (2.1.0), or GitHub workflow annotations |
| `--output` | stdout | Report file, relative to the current working directory |
| `--config` | `berthlint.config.json` | Config path relative to the scanned project |
| `--configuration` | `Release` | Exact Xcode build configuration name |
| `--ios-sdk-version` | config value | User-declared iOS build SDK, not the deployment target |
| `--xcode-version` | config value | User-declared numeric Xcode release version |
| `--no-interactive` | false | Disable the missing-SDK prompt |
| `--no-plugins` | false | Never resolve, import or execute configured plugins |
| `--suppressions` | `berthlint.suppressions.json` | Exact-match accepted findings |
| `--strict` | false | Treat warnings as CI failures |
| `--list-rules` | false | List rules and titles without scanning |

Exit codes are 0 for no errors, 1 for validation errors (or warnings in strict
mode), and 2 for execution failures. Execution failures go to stderr, not into
a success-shaped JSON report. Notes never cause a failure. JSON output has the
shape `{ schemaVersion: 1, findings: [...], summary: { error, warning, note } }`.
Findings are sorted deterministically and include a stable rule ID, location,
message, suggested fix and policy URL.

## Recognized layouts

```text
mobile-app/
  App.xcodeproj/project.pbxproj
  App/Info.plist
  App/PrivacyInfo.xcprivacy
  app/build.gradle.kts
  app/src/main/AndroidManifest.xml
  fastlane/
    metadata/en-US/name.txt
    metadata/android/en-US/title.txt
    screenshots/en-US/*.png
```

Native files are discovered recursively. Platform-specific `ios/fastlane/...`
and `android/fastlane/...` layouts also work. Standalone `Info.plist` and root
`AndroidManifest.xml` are supported for simple projects. When an Xcode project
is present, only its application and app-extension targets are loaded, not
unrelated test or framework plists. iOS locale-local `screenshots/` directories
are also read.

## Configuration

All properties are optional; unknown properties and rule IDs are errors. Paths
are relative to the scanned project.

```json
{
  "defaultLocale": "en-US",
  "configuration": "Release",
  "iosSdkVersion": "26.0",
  "xcodeVersion": "26.0",
  "androidDevice": "phone",
  "metadata": {
    "ios": "fastlane/metadata",
    "android": "fastlane/metadata/android"
  },
  "screenshots": { "ios": "fastlane/screenshots" },
  "previousAndroidVersionCode": 41,
  "plugins": ["./tools/release-rules.mjs"],
  "rules": {
    "ios/transport-security": "warning",
    "ios/deprecated-apis": "off",
    "metadata/localizations": { "severity": "error" }
  }
}
```

`androidDevice` accepts `phone`, `wear`, `automotive`, `tv` and `xr`; it selects
the published submission/update target SDK minimum, not the existing-app
availability threshold. Non-phone screenshot checks are explicitly skipped
with a coverage warning.

Xcode configuration names must match exactly. Berthlint does not guess another
configuration or silently skip targets when `Release` is absent. Override with
`--configuration <name>` or the `configuration` setting.

For a reproducible Android release comparison, set `"baselineTag": "v1.2.0"`
instead of `previousAndroidVersionCode`. Berthlint reads each module's Gradle
file at that tag without checking it out. If both are set, `baselineTag` takes
precedence. Missing tags, baseline files or unresolved baseline versions are
execution errors. No tag is guessed automatically.

Rule values are `off`, `error`, `warning`, or `note`, either directly or in a
`{ "severity": ... }` object. `system/analysis` controls loader coverage
diagnostics.

## Suppressions

Commit a `berthlint.suppressions.json` file to accept reviewed findings while
continuing to check for new ones:

```json
{
  "schemaVersion": 1,
  "suppressions": [
    {
      "ruleId": "ios/deprecated-apis",
      "file": "App/LegacyView.swift",
      "message": "Deprecated iOS API: UIWebView.",
      "reason": "Legacy migration tracked in the team's release backlog."
    }
  ]
}
```

Copy `ruleId`, `file` and `message` exactly from a JSON report. All three must
match; paths use forward slashes and are relative to the scanned project (`.`
is valid for project-wide findings). There are no globs or whole-rule
suppressions. Source line numbers are ignored. Each entry requires a nonblank
reason. Unknown rule IDs, duplicate entries, unknown fields, malformed JSON and
missing explicitly selected files are execution errors. A missing default file
means no suppressions. Unmatched entries are retained without error; remove
obsolete entries during review.

Suppressed findings are excluded from reports, summary counts and exit-code
decisions. Rules still execute and execution failures are never suppressed.
Use `--suppressions <file>` to select another file.

## GitHub Actions and fastlane

The [composite Action](../action.yml) installs the published package and emits
GitHub annotations. Pin a reviewed commit SHA for stronger immutability. Its
`no-plugins` input defaults to `"true"`.

For SARIF output, upload with `github/codeql-action/upload-sarif` using
`sarif_file: berthlint.sarif` and `security-events: write` permissions. Run the
upload step with `if: always()` because validation findings return 1. SARIF
paths are relative to the scanned project.

In a fastlane `Fastfile`, place the check before existing build/upload steps:

```ruby
lane :release do
  sh("berthlint .. --strict --no-interactive --no-plugins --ios-sdk-version 26.0 --xcode-version 26.0")
  build_app
  upload_to_app_store
end
```

Keep Berthlint as a required CI check. Do not mask failures with `|| true`,
`continue-on-error` or a rescued fastlane error. Add narrow, reasoned
suppressions for accepted exceptions rather than disabling whole rules.

## Development

```sh
npm install
npm run build
node dist/cli.js /path/to/mobile-app
npm run check
```

`npm run dev -- /path/to/mobile-app --strict` runs TypeScript directly.
`npm run smoke:package` installs the tarball into a temporary consumer and checks
the CLI, JSON report, public ESM exports and packaged documentation.
