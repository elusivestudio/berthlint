I picked **idea 3, the mobile release checklist and metadata validator**. It uses your native iOS and Android experience, the space is underserved in open source, and you already know firsthand which things get apps rejected. Working name: **shipcheck**.

## Core idea

You run `npx shipcheck` in a mobile repo, with no build needed. It statically scans the project and the store metadata and reports problems that would cause a rejection or a delayed release, each with a fix suggestion and a link to the relevant store policy.

## Architecture

```
            ┌──────────────┐
  CLI /     │   Reporter   │  text · JSON · SARIF · GitHub annotations
  Action ──▶│   (output)   │
            └──────▲───────┘
                   │ findings
            ┌──────┴───────┐      ┌────────────────────┐
            │ Rule engine  │◀─────│ Requirements data  │
            │ (run, filter,│      │ (versioned JSON:   │
            │  severity)   │      │  limits, min SDKs) │
            └──────▲───────┘      └────────────────────┘
                   │ ProjectModel
            ┌──────┴───────────────────────────┐
            │ Project loaders                  │
            │ iOS: plist, pbxproj, xcprivacy   │
            │ Android: manifest, gradle        │
            │ Store metadata: fastlane folders │
            └──────────────────────────────────┘
```

**Loaders** turn the repo into a normalized `ProjectModel` (versions, permissions, targets, metadata strings, image files). Rules never touch the filesystem directly, which keeps them easy to test and write.

**Rules** are small pure functions: `check(model) → Finding[]`. Each has an ID, platform, default severity, a doc link and a fix hint. Plugins are just npm packages that export rules, which makes community contributions simple.

**Requirements data** is the key design decision. Store limits and minimum SDK levels change often, so they live in versioned JSON, each with a `verifiedOn` date. A scheduled GitHub Action can flag entries that haven't been re-verified in a while. That stops the tool from silently going stale, which is how most tools in this space die.

**Metadata format:** read fastlane's `metadata/` and `screenshots/` folder layout. Many teams already use it, so adoption needs no new config.

## MVP scope (about 20-25 rules)

**iOS**
- Usage description strings in Info.plist match the APIs the source uses (camera, location, photos, and so on)
- `PrivacyInfo.xcprivacy` exists and declares the required-reason APIs found in your code
- Version and build numbers are consistent across targets and extensions
- App Transport Security exceptions are flagged
- Deployment target and Xcode/SDK requirements

**Android**
- `targetSdkVersion` against the current Play minimum
- Components with intent filters missing an explicit `android:exported`
- Declared permissions versus permissions actually used, flagging sensitive ones
- `versionCode` is higher than the last git-tagged release

**Store metadata (both)**
- Title, subtitle, keywords and description length limits
- Screenshot dimensions and counts per device class
- Missing localizations compared with your default locale

**Tooling:** a zero-config first run, an optional `shipcheck.config.json` to disable or tune rules, a GitHub Action that posts annotations on the PR, and exit codes for CI.

**Explicitly out of MVP:** inspecting built `.ipa`/`.aab` files, uploading to the stores, generating screenshots, React Native and Flutter project layouts, and anything that needs store credentials.

## Suggested tech stack

- **TypeScript on Node**, distributed through `npx`. It needs no install, has the largest contributor pool, and is easy to run in any CI.
- **Parsing:** `plist` for Info.plist, a pbxproj parser for Xcode projects, `fast-xml-parser` for `AndroidManifest.xml`, and regex-based Gradle reading for the MVP. Gradle's DSL is hard to parse fully, so start with the common patterns and fail gracefully.
- **Images:** `image-size`, which reads dimensions without decoding the image.
- **Testing:** Vitest, with a `fixtures/` folder of tiny sample projects, one per rule, both passing and failing. Fixture-per-rule is also the easiest way for contributors to add rules.
- **Output:** SARIF, so findings appear in GitHub's code scanning UI for free.
- **Docs:** one page per rule, generated from rule metadata, with the *why*, how to fix it, and the store policy link.

Go is a reasonable alternative if you prefer a single static binary. I'd still choose TypeScript here because contributors are more likely to know it.

## Suggested path

1. **Weeks 1-2:** loaders and the rule engine, with five iOS rules and the text reporter.
2. **Weeks 3-4:** Android rules, the metadata and screenshot checks, and the GitHub Action.
3. **Week 5:** docs site, a README with a GIF of a failing and then passing run, and the plugin API.
4. **Launch:** run it against a few popular open-source mobile apps and share any real issues it finds. That demonstrates its value.

Before you build, verify the current store limits and the required-reason API list against Apple's and Google's docs, since I haven't checked them for this sketch. I can draft the `Rule` interface and the first three rules in TypeScript, or write the README, if you'd like.