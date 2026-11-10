# Berthlint

Catch avoidable release problems in native iOS and Android apps **before
building or uploading**. Berthlint statically checks project files and fastlane
store metadata; it needs no store credentials, Xcode, Android SDK, or network
access.

**32 built-in rules** cover native project settings, privacy and permission
declarations, and store listings. Extend checks with trusted JavaScript plugins.

[Version 0.1.3 on npm](https://www.npmjs.com/package/berthlint/v/0.1.3),
published with build provenance from GitHub Actions.

![Berthlint displays errors, warnings and notes in a table, then reports no findings after the release settings are corrected.](./docs/assets/readme-demo.gif)

*Focused Android fixture: the demo enables target SDK, version name and release
baseline checks only. A passing scan is not a guarantee of store acceptance.*

## What it checks

- **iOS:** SDK and deployment requirements, privacy manifests, usage descriptions,
  transport security and version consistency.
- **Android:** submission target SDK, exported components, permissions, debugging
  settings and version codes.
- **Store listings:** fastlane metadata fields, localization completeness, and
  screenshot dimensions and counts.
- **CI output:** readable text, JSON, SARIF and GitHub workflow annotations.

## Get started

Requires Node.js **22.18+** and npm. From a mobile project directory, run:

```sh
npx berthlint@0.1.3 .
```

For CI, a strict, non-interactive scan that avoids loading configured plugins is:

```sh
npx berthlint@0.1.3 . --strict --no-interactive --no-plugins
```

For a reproducible project dependency, install the exact version and commit the
lockfile:

```sh
npm install --save-dev --save-exact berthlint@0.1.3
npx --no-install berthlint . --strict --no-interactive --no-plugins
```

Scanning is offline; installing the package requires npm registry access unless
the package and its dependencies are already cached.

## CI

The composite Action installs the published runtime package (without the
development dependency tree or a per-run TypeScript build) and emits GitHub
annotations. After checking out your mobile app:

```yaml
- uses: elusivestudio/berthlint@v0.1.3
  with:
    path: .
    strict: "true"
    no-plugins: "true"
    platform: all
    ios-sdk-version: "26.0"
    xcode-version: "26.0"
```

The Action defaults `no-plugins` to `"true"`. Pin a reviewed commit SHA for
stronger immutability. For SARIF output, run the CLI with
`--format sarif --output berthlint.sarif` and upload the report with
`github/codeql-action/upload-sarif` and `security-events: write`.

## Related tools

[StorePreflight](https://github.com/suntan-superman/StorePreflight),
[StoreReady](https://github.com/MaTriXy/StoreReady),
[ShipLint](https://github.com/Signal26AI/ShipLint), and
[storehound](https://github.com/saimskywalker/storehound) are related projects.

## Limitations

Berthlint is static triage, not a build, upload, App Review, or Play review
replacement. It cannot inspect remote listings or certify the actual toolchain
or uploaded artifact. Gradle and Xcode settings are resolved only where the
supported static inputs are understood; source checks are heuristic. Plugins
are executable code and are not sandboxed. See the [usage reference](./docs/usage.md),
[limitations and policy notes](./docs/limitations.md), and [rule reference](./docs/index.html).

Policy data is a reviewed snapshot, not live policy. The [source data](https://raw.githubusercontent.com/elusivestudio/berthlint/main/src/requirements/store.v1.json)
records its verification date and official links. In particular, Apple currently
requires iOS 13 or later for App Store uploads (since September 9, 2026), and its
screenshot specification sets an April 2027 Duo screenshot requirement for apps
using the iOS 27.1 SDK or later. See [policy details](./docs/limitations.md).

## Development

```sh
git clone https://github.com/elusivestudio/berthlint.git
cd berthlint
npm install
npm run build
npm run check
npm link
```

`npm run smoke:package` packs the package and verifies it in a temporary
consumer. See the [development commands](./docs/usage.md#development) and
[release instructions](./docs/releasing.md).

MIT licensed.
