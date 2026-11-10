# Berthlint: real-world scan evidence

Five user-supplied native-app scan captures, organized for review on 2026-11-10.
These demonstrate scanner behavior on real projects, not app certification,
confirmed upstream defects, or endorsement by the projects.

## Results

All captures identify **0.1.0 running local development source** under the former
Shipcheck name. Historical CLI output below each report is deliberately unchanged;
old package/config names there are evidence, not current installation instructions.
The version alone does not identify an immutable tool revision.

| Project | Platform | Configuration | Errors | Warnings | Notes | Evidence |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Ice Cubes | iOS | Release (default) | 1 | 4 | 1 | [Report](./2026-11-10-ice-cubes-ios.md) |
| Home Assistant | iOS | Release (default) | 11 | 29 | 2 | [Report](./2026-11-10-home-assistant-ios.md) |
| Firefox | iOS | Firefox (explicit) | 0 | 5 | 2 | [Report](./2026-11-10-firefox-ios.md) |
| Fossify Gallery | Android | Static defaults | 0 | 10 | 1 | [Report](./2026-11-10-fossify-gallery-android.md) |
| Material Files | Android | Static defaults | 0 | 19 | 1 | [Report](./2026-11-10-material-files-android.md) |
| **Total findings** | | | **12** | **67** | **7** | |

Counts are not comparable app-quality scores. Projects differ in source layout,
available assets and analysis coverage. Zero errors is not a clean bill of health.

## What the evidence supports

- Completed static scans across three iOS and two Android projects.
- Multi-target iOS analysis, including an explicit custom archive configuration.
- Separate reporting for invalid present metadata and absent local listing assets.
- Permission/API review hints with source locations, remediation and policy links.
- Explicit coverage gaps for external build settings, package ownership and
  missing release baselines rather than implied compliance.

The Home Assistant capture includes concrete metadata violations; privacy,
permission, deprecated-API and network findings still need context.
Reduced finding counts alone do not prove improved accuracy or measured
false-positive rates. Historical development observations are documented
separately in [release validation](../docs/release-validation.md).

## Recommended presentation

Use **"Berthlint: real-world native-app scan evidence"** as the collection title.
Describe individual reports as **"[Project]: [platform] static scan evidence"**,
not audits, certifications or vulnerability reports.

Suggested public summary:

> Berthlint was exercised against five open-source native mobile projects.
> These captures show source-level release checks, actionable review hints and
> explicit analysis limits. They do not establish store acceptance or defects
> in the published applications.

### File naming

Use `YYYY-MM-DD-<project>-<platform>.md`, for example
`2026-11-10-fossify-gallery-android.md`. These filenames use the report preparation
date, not a verified capture timestamp. Keep historical reports immutable;
future runs can use a separate dated folder or a run suffix for same-day repeats.

## Provenance and limits

- Source: user-supplied text captures, not newly executed scans for this collection.
- The original finding bodies, ordering and counts are preserved inside expandable
  fenced text blocks. Only local project-directory prefixes were normalized to
  `<projects>` to avoid exposing a workstation's home path. Original captures
  sometimes omitted the shell invocation; reproduction commands are supplied
  separately and are not represented as captured output.
- iOS captures declare SDK **27.0** through an interactive prompt; no Xcode version
  is declared. Reproduction commands supply the SDK explicitly to avoid prompting.
  Declared SDK is not proof of the archive's actual toolchain.
- No version baseline is supplied for Android. Gradle is not executed and final
  variant/output overrides are not certified.
- Exact tool/input commit IDs, dirty-worktree state, capture timestamps, local
  configuration contents, environment and process exit codes were not embedded
  in these captures. Defaults in report headers describe the shown commands;
  undisclosed local configuration overrides cannot be ruled out.
- No builds, store uploads, remote-listing checks, runtime testing or independent
  precision/recall assessment are evidenced by these files.

Before calling a future run a reproducible benchmark, capture the tool and app
commit IDs and dirty status, Node version, exact command/configuration, policy
snapshot, timestamp and exit code alongside raw text and JSON output. Record
human triage separately from scanner severity, and label before/after runs with
their distinct tool revisions.
