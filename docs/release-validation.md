# MVP release validation

Validated on 2026-11-10 with Node 24.16.0 and npm 10.9.8.
Checks are offline at runtime; only dependency installation and source downloads
need network access. No store credentials, app builds, or upstream build scripts
were used. These results are static triage, not proof of App Store acceptance.

## Automated and distribution checks

```sh
npm run check
npm run smoke:package
```

The first command type-checks source, tests and scripts, runs the test suite,
verifies generated rule pages and compiles the CLI. The package smoke test packs
the release, installs it into a fresh temporary consumer, checks the installed
CLI/version/JSON scan, imports the public ESM API and policy data, and verifies
packaged documentation. It cleans up the temporary consumer and tarball.
CI runs these commands on Node 22.18 and 24.

The initial generated site was also checked in a browser: 31 rule links, SDK rule details,
its configuration example and policy link, and navigation back to the index.
The test suite checks every generated rule page and local navigation link.

## Release-readiness rerun (2026-11-10)

The Berthlint rename was checked across package metadata, the lockfile, CLI,
Action, workflows, SARIF and generated pages. `npm run docs` regenerated all
33 pages. Old branding is retained only in explicitly historical captures.

Release validation passed source/test type-checking, the test suite,
documentation freshness, compilation, the packed-consumer smoke test and
`npm publish --dry-run --provenance --access public`. This was a dry run, not
publication or verification of a generated provenance attestation. npm
authentication, actual publication and release tagging remain maintainer steps.
New tests cover plugin import prevention, exact-match suppressions, report
counts/exit codes, Action argument forwarding and the release-tag guard.

Three available public app checkouts were rescanned read-only with Node
**24.16.0** at **2026-11-10 01:14 UTC**, policy snapshot **2026-11-10**:

| Input | Commit | Errors / warnings / notes | Exit |
| --- | --- | --- | --- |
| IceCubesApp | `98098b9c4b5928f89f338203193c2bf40ab7f38c` | 1 / 4 / 1 | 1 |
| Material Files | `93c333960aa897836ba3f215a19d0cb0de494db1` | 0 / 19 / 1 | 0 |
| Firefox iOS | `13c95cb20e4c9570af2175529802f597cf010f40` | 0 / 5 / 2 | 0 |

All three input worktrees were clean. The scanner used the **uncommitted working
tree based on `c13e5b0dab97ace02d119a504dfcd1df1649680b`**; that commit alone does
not reproduce these scanner changes. It was built with `npm run build`.
No input build scripts, store credentials or plugins were used. A trusted
external config contained `{}` and a trusted external suppressions file contained
`{"schemaVersion":1,"suppressions":[]}`. No Xcode version or Android baseline was
declared. Commands, replacing the local paths, were:

```sh
node dist/cli.js /path/to/IceCubesApp --platform ios --ios-sdk-version 27.0 \
  --no-plugins --no-interactive --config /trusted/empty-config.json \
  --suppressions /trusted/empty-suppressions.json --format json --output icecubes.json
node dist/cli.js /path/to/MaterialFiles --platform android \
  --no-plugins --no-interactive --config /trusted/empty-config.json \
  --suppressions /trusted/empty-suppressions.json --format json --output materialfiles.json
node dist/cli.js /path/to/firefox-ios/firefox-ios --platform ios \
  --configuration Firefox --ios-sdk-version 27.0 --no-plugins --no-interactive \
  --config /trusted/empty-config.json --suppressions /trusted/empty-suppressions.json \
  --format json --output firefox.json
```

JSON reports and invocation records were retained outside the repository in the
session workspace. These are behavior/regression checks, not a new independent
false-positive assessment or store-acceptance claim. The Ice Cubes missing
privacy-manifest result still needs build-resource review; other existing
findings and coverage limits remain advisory as described below.

## Public native-app smoke tests

The inputs below are public, independently licensed projects. Their code is not
copied into Berthlint. The SDK/Xcode arguments below are test declarations, not
claims about the apps' actual release toolchains.

| Project | Pinned revision | Observed result |
| --- | --- | --- |
| [IceCubesApp](https://github.com/Dimillian/IceCubesApp/tree/98098b9c4b5928f89f338203193c2bf40ab7f38c) | `98098b9c4b5928f89f338203193c2bf40ab7f38c` | Exit 1: 1 error, 14 warnings, 0 notes |
| [Material Files](https://github.com/zhanghai/MaterialFiles/tree/93c333960aa897836ba3f215a19d0cb0de494db1) | `93c333960aa897836ba3f215a19d0cb0de494db1` | Exit 1: 1 error, 32 warnings, 1 note |

Reproduce in a separate scratch directory (never run either app's build scripts):

```sh
git clone --filter=blob:none --sparse https://github.com/Dimillian/IceCubesApp.git
git -C IceCubesApp checkout --detach 98098b9c4b5928f89f338203193c2bf40ab7f38c
git -C IceCubesApp sparse-checkout set IceCubesApp.xcodeproj IceCubesApp \
  IceCubesActionExtension IceCubesAppIntents IceCubesAppWidgetsExtension \
  IceCubesNotifications IceCubesShareExtension Packages

git clone https://github.com/zhanghai/MaterialFiles.git
git -C MaterialFiles checkout --detach 93c333960aa897836ba3f215a19d0cb0de494db1

node /path/to/berthlint/dist/cli.js IceCubesApp --platform ios \
  --ios-sdk-version 26.0 --xcode-version 26.0 --format json --output icecubes.json
node /path/to/berthlint/dist/cli.js MaterialFiles --platform android \
  --format json --output materialfiles.json
```

Both exit codes are expected validation results, not crashes:

- **IceCubesApp:** one missing-privacy-manifest finding; the pinned repository tree
  has no `PrivacyInfo.xcprivacy`. Five xcconfig coverage warnings, one missing-store-
  metadata warning and eight usage-description warnings also appear. Purpose-string
  warnings compare source across targets and need ownership review; external build
  settings and dependency-supplied manifests were not evaluated.
- **Material Files:** the `zh-CN` listing has no local screenshots. Existing remote
  screenshots or deliberate locale fallback could make this intentional. The
  manifest explicitly allows cleartext traffic and declares three flagged sensitive
  permissions; these are review items, not confirmed policy violations. There are
  28 deprecated-API token warnings and one note that no previous version baseline
  was supplied.

These observations have not been filed upstream as confirmed release defects.

## Scan-driven fixes and rerun (2026-11-10)

The original results above are retained as the pre-fix baseline. After reviewing
the user's four native-app scans, the same local projects were rescanned read-only
with declared SDK `27.0`, no declared Xcode and no version baseline:

| Project and revision | Before: errors / warnings / notes | After: errors / warnings / notes |
| --- | --- | --- |
| IceCubesApp `98098b9c4b5928f89f338203193c2bf40ab7f38c` | 1 / 14 / 5 | 1 / 4 / 1 |
| Material Files `93c333960aa897836ba3f215a19d0cb0de494db1` | 1 / 32 / 1 | 0 / 19 / 1 |
| [Fossify Gallery](https://github.com/FossifyOrg/Gallery/tree/2688360242468f1d591eddf23740c879616bb828) `2688360242468f1d591eddf23740c879616bb828` | 60 / 43 / 1 | 0 / 10 / 1 |
| [Home Assistant iOS](https://github.com/home-assistant/iOS/tree/f160c758cce93fa87531b91cfa7e65fd8a524032) `f160c758cce93fa87531b91cfa7e65fd8a524032` | 24 / 108 / 10 | 11 / 29 / 2 |

These are not just severity reductions:

- iOS permission checks follow direct Sources membership and synchronized-folder
  exceptions rather than attributing every source to every target. Unmapped
  package sources retain explicit ownership-review warnings.
- Watch/non-iOS targets are excluded from iOS checks. Sources known to belong
  only to tests or excluded platforms are removed from iOS source analysis;
  shared app sources are retained.
- Unresolved version/build pairs are excluded from comparisons. A real mismatch
  between fully resolved sibling targets is still reported.
- Repeated xcconfig/deployment coverage is grouped with affected targets named.
- Import-only deprecated symbols are ignored, and actual uses are deduplicated
  per file/API.
- Absent local store assets are grouped `metadata/completeness` warnings, not
  confirmed blockers. The user can promote this rule to error for self-contained
  listings. Present empty/short required fields, overlong strings, invalid sizes
  and nonempty undersized/excess screenshot sets remain errors.
- Gallery's catalog/property settings now resolve to target SDK **36**, version
  code **40**, version name **1.14.2**. A detected variant/output override still
  needs manual review.

Home Assistant's remaining eleven errors are four keyword-byte overruns, six
present empty required fields and one missing-privacy-manifest finding.
Metadata optional-field parity, ATS settings, package ownership and build-time
privacy resources still require human review. No upstream defect claim is made.

To reproduce, use the same commands above with `--ios-sdk-version 27.0` and omit
`--xcode-version`; scan the additional pinned native checkouts in the same way.

Final local validation passed: **212 tests**, source/test type-checking, all
**33 generated documentation pages**, compilation and packed-consumer smoke
(installed CLI, JSON report, public ESM exports, requirements and documentation).
Regression coverage includes unresolved platform declarations, shared app/Watch
sources, target membership exceptions, catalog/baseline resolution, missing versus
invalid metadata and CLI strict/severity overrides.

## Official policy verification

Values were checked against official sources on 2026-11-10:

| Area | Verified policy and source |
| --- | --- |
| Build SDK/Xcode | [Apple SDK minimum](https://developer.apple.com/news/upcoming-requirements/?id=04282026a): iOS SDK 26 and Xcode 26 or later since 2026-04-28 |
| Deployment OS | [Apple minimum system requirement](https://developer.apple.com/news/upcoming-requirements/?id=0992026a): iOS 13 or later since 2026-09-09 |
| Xcode deployment support | [Apple Xcode table](https://developer.apple.com/support/xcode/): the **Deployment Targets** column starts at iOS 15 for Xcode 26 and 27; the different Device Support/debugging column is not an upload deployment minimum |
| Google Play target SDK | [Google target API policy](https://support.google.com/googleplay/android-developer/answer/11926878): phone 36, Wear/Automotive 35, TV/XR 34 for new apps and updates |
| Listing lengths | [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [Apple version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information), [Google listing details](https://support.google.com/googleplay/android-developer/answer/9859152): existing limits retained, including Apple's 100-byte keywords limit |
| Screenshots | [Apple specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), [Google preview assets](https://support.google.com/googleplay/android-developer/answer/9866151): existing general dimensions/counts retained; published Duo inner/outer dimensions added |
| Required-reason categories | [Apple structured documentation](https://developer.apple.com/tutorials/data/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype.json): FileTimestamp, SystemBootTime, DiskSpace, ActiveKeyboards and UserDefaults |

Apple's announced April 2027, SDK-dependent Duo screenshot requirement needs a
fresh policy review before activation; it is not enforced early by this release.
Specialized Android listing assets remain explicitly outside screenshot coverage.

## Remaining release operations

- Publish to npm only after checking package-name availability and configuring
  the publisher account.
- Enable public static documentation hosting if desired; the generated site is
  already usable locally and packaged.
- An animated README demo and public launch announcement are optional launch
  presentation work, not runtime features.
