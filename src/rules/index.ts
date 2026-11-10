import type { Rule } from "../types.ts";
import { isAndroidPhoneScreenshot, requirements } from "../requirements.ts";
import { iosRules } from "./ios.ts";
import { iosReleaseRules } from "./ios-release.ts";
import { androidRules } from "./android.ts";
import { metadataRules } from "./metadata.ts";

export const builtInRules: readonly Rule[] = [
  ...iosRules, ...iosReleaseRules, ...androidRules, ...metadataRules,
  {
    id: "system/requirements-stale", title: "Requirements freshness", platform: "all", severity: "warning",
    description: "Store policies change independently of the tool. A dated local policy snapshot needs periodic verification against official sources.",
    policyUrl: requirements.sources.androidTarget,
    fix: "Re-verify store policies against the linked official documentation and update the versioned requirements data.",
    check: (_model, context) => context.now.getTime() - Date.parse(requirements.verifiedOn)
      > requirements.reviewAfterDays * 86400000
      ? [{ file: ".", message: `Store requirements were last verified on ${requirements.verifiedOn}; review is overdue.` }] : [],
  },
  {
    id: "system/specialized-android-store", title: "Specialized Android screenshot coverage", platform: "android", severity: "warning",
    description: "Phone/tablet asset checks do not prove compliance for Wear, Automotive, TV or XR. Unsupported groups must be reviewed manually rather than silently passing.",
    policyUrl: requirements.sources.androidScreenshots,
    fix: "Review Wear, Automotive, TV or XR screenshot and listing policies manually; only phone/tablet assets are validated.",
    check(model, context) {
      if (context.androidDevice !== "phone"
        && (model.android.length || model.locales.some((locale) => locale.platform === "android"))) {
        return [{ file: ".", message: `${context.androidDevice} selected: device-specific screenshot validation is not implemented.` }];
      }
      return model.locales.filter((locale) => locale.platform === "android")
        .flatMap((locale) => [...new Set(locale.screenshots.filter((shot) => !isAndroidPhoneScreenshot(shot.group))
          .map((shot) => shot.group))].map((group) => ({
          file: locale.directory, message: `${group} assets detected: device-specific screenshot validation is not implemented.`,
        })));
    },
  },
];
