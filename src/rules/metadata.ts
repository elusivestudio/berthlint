import type { Rule } from "../types.ts";
import { isAndroidPhoneScreenshot, requirements } from "../requirements.ts";
import { defineRule } from "./helpers.ts";

export const metadataRules: Rule[] = [
  defineRule({
    id: "metadata/completeness", title: "Local store metadata coverage", platform: "all", severity: "warning",
    description: "Absent local fields and screenshots do not prove a submission failure: existing store listings or deliberate localization fallback may supply them. Summarized coverage warnings are separate from invalid present values.",
    policyUrl: requirements.sources.iosMetadata,
    fix: "Review remote listing values and localization fallback, or add the missing local assets. Promote metadata/completeness to error for a fully self-contained listing; --strict also fails on warnings.",
    check: (model, context) => (["ios", "android"] as const).flatMap((platform) => {
      const locales = model.locales.filter((locale) => locale.platform === platform);
      if (!locales.length) return [];
      const missing = new Map<string, string[]>();
      for (const locale of locales) {
        for (const [field, limit] of Object.entries(requirements.metadata[platform])) {
          if (limit.required && locale.fields[field] === undefined) {
            missing.set(field, [...(missing.get(field) ?? []), locale.locale]);
          }
        }
        const screenshots = platform === "ios" ? locale.screenshots
          : locale.screenshots.filter((shot) => isAndroidPhoneScreenshot(shot.group));
        if ((platform === "ios" || context.androidDevice === "phone") && !screenshots.length) {
          missing.set("screenshots", [...(missing.get("screenshots") ?? []), locale.locale]);
        }
      }
      return [...missing].map(([field, names]) => ({
        file: locales[0]!.directory.split("/").slice(0, -1).join("/") || ".",
        message: `${platform}: no local ${field} for ${names.length} locale(s): ${names.join(", ")}. Remote listing values or intended store fallback were not checked.`,
        policyUrl: requirements.sources[platform === "ios" ? "iosMetadata" : "androidMetadata"],
      }));
    }),
  }),
  defineRule({
    id: "metadata/lengths", title: "Store metadata lengths", platform: "all", severity: "error",
    description: "Listings exceeding store field limits cannot be submitted unchanged. Apple keywords use UTF-8 bytes; other fields are counted as Unicode code points.",
    policyUrl: requirements.sources.iosMetadata, fix: "Shorten the field to its store limit. Apple keywords use UTF-8 bytes; other fields use Unicode code points.",
    check: (model) => model.locales.flatMap((locale) => Object.entries(requirements.metadata[locale.platform])
      .flatMap(([name, limit]) => {
        const field = locale.fields[name];
        if (!field) return [];
        const length = limit.unit === "bytes" ? Buffer.byteLength(field.value, "utf8") : [...field.value].length;
        return length <= limit.max ? [] : [{
          file: field.file, message: `${locale.platform} ${locale.locale} ${name}: ${length} ${limit.unit}; maximum ${limit.max}.`,
          policyUrl: locale.platform === "ios"
            ? name === "name" || name === "subtitle" ? requirements.sources.iosName : requirements.sources.iosMetadata
            : requirements.sources.androidMetadata,
        }];
      })),
  }),
  defineRule({
    id: "metadata/required-fields", title: "Required store metadata fields", platform: "all", severity: "error",
    description: "Present mandatory listing fields must contain a meaningful value of the minimum length. Absent files are reported separately as metadata/completeness coverage, not definite store rejection.",
    policyUrl: requirements.sources.androidMetadata, fix: "Add the missing localized fastlane text field, or supply a meaningful value of the minimum length.",
    check: (model) => model.locales.flatMap((locale) => Object.entries(requirements.metadata[locale.platform])
      .flatMap(([name, limit]) => {
        const field = locale.fields[name];
        return limit.required && field !== undefined && [...field.value.trim()].length < limit.min
          ? [{
            file: field?.file ?? `${locale.directory}/${name}.txt`,
            message: `${locale.platform} ${locale.locale} requires ${name} (minimum ${limit.min}).`,
            policyUrl: locale.platform === "ios" ? requirements.sources.iosMetadata : requirements.sources.androidMetadata,
          }] : [];
      })),
  }),
  defineRule({
    id: "metadata/localizations", title: "Localization field parity", platform: "all", severity: "warning",
    description: "Missing default-locale translations can create incomplete listings. Required-field absence is reported by metadata/completeness and blank required values by metadata/required-fields, not repeated here. Optional-field parity is advisory; remote fallback is not inspected.",
    policyUrl: requirements.sources.iosMetadata, fix: "Provide the default locale and translate fields present in it; review intended store fallback behavior.",
    check: (model, context) => (["ios", "android"] as const).flatMap((platform) => {
      const locales = model.locales.filter((locale) => locale.platform === platform);
      if (!locales.length) return [];
      const base = locales.find((locale) => locale.locale === context.defaultLocale);
      const policyUrl = platform === "ios" ? requirements.sources.iosMetadata : requirements.sources.androidMetadata;
      if (!base) return [{
        file: locales[0]!.directory, message: `${platform} default locale ${context.defaultLocale} was not found.`, policyUrl,
      }];
      return locales.filter((locale) => locale !== base).flatMap((locale) =>
        Object.keys(base.fields).filter((field) => {
          const limit = Object.entries(requirements.metadata[platform]).find(([name]) => name === field)?.[1];
          return !limit?.required && !locale.fields[field]?.value.trim();
        })
          .map((field) => ({
            file: locale.directory, message: `${locale.locale} is missing ${field} present in ${context.defaultLocale}.`, policyUrl,
          })));
    }),
  }),
  defineRule({
    id: "metadata/screenshot-dimensions", title: "Screenshot dimensions", platform: "all", severity: "error",
    description: "Screenshot uploads must match supported iPhone/iPad display sizes or Android phone/tablet dimension and aspect-ratio limits. Image content and alpha are not inspected.",
    policyUrl: requirements.sources.iosScreenshots, fix: "Export PNG/JPEG screenshots at a supported iPhone/iPad size, or within Google Play's dimension and aspect-ratio limits.",
    check: (model, context) => model.locales.flatMap((locale) => locale.screenshots.flatMap((shot) => {
      const { minDimension, maxDimension, maxAspectRatio } = requirements.screenshots.android;
      const short = Math.min(shot.width, shot.height);
      const long = Math.max(shot.width, shot.height);
      const valid = locale.platform === "ios" ? shot.group !== "unknown"
        : context.androidDevice !== "phone" || !isAndroidPhoneScreenshot(shot.group) ? true
          : short >= minDimension && long <= maxDimension && long <= short * maxAspectRatio;
      return valid ? [] : [{
        file: shot.file, message: `Unsupported ${locale.platform} screenshot size ${shot.width}x${shot.height}.`,
        policyUrl: requirements.sources[locale.platform === "ios" ? "iosScreenshots" : "androidScreenshots"],
      }];
    })),
  }),
  defineRule({
    id: "metadata/screenshot-counts", title: "Screenshot counts", platform: "all", severity: "error",
    description: "Present screenshot sets must meet minimum counts and upload limits per display/device group. Completely absent local sets are coverage warnings instead; specialized Android device classes are not covered.",
    policyUrl: requirements.sources.androidScreenshots, fix: "Supply at least one iOS screenshot and two Android phone/tablet screenshots in total, within each device group's upload limit.",
    check: (model, context) => model.locales.flatMap((locale) => {
      if (locale.platform === "android" && context.androidDevice !== "phone") return [];
      const issues = [];
      const screenshots = locale.platform === "ios" ? locale.screenshots
        : locale.screenshots.filter((shot) => isAndroidPhoneScreenshot(shot.group));
      const minimum = locale.platform === "ios" ? 1 : requirements.screenshots.android.minTotal;
      const policyUrl = requirements.sources[locale.platform === "ios" ? "iosScreenshots" : "androidScreenshots"];
      if (screenshots.length > 0 && screenshots.length < minimum) issues.push({
        file: locale.directory, message: `${locale.platform} ${locale.locale}: ${screenshots.length} screenshots; at least ${minimum} required.`,
        policyUrl,
      });
      const counts = new Map<string, number>();
      for (const shot of screenshots) counts.set(shot.group, (counts.get(shot.group) ?? 0) + 1);
      const maximum = requirements.screenshots[locale.platform].maxPerGroup;
      for (const [group, count] of counts) if (count > maximum) issues.push({
        file: locale.directory, message: `${group}: ${count} screenshots; maximum ${maximum}.`,
        policyUrl,
      });
      return issues;
    }),
  }),
  defineRule({
    id: "metadata/ios-required-screenshots", title: "Required iOS device screenshots", platform: "ios", severity: "warning",
    description: "Supported device families need the required display assets. Detected sizes approximate scaling coverage; confirm the final mapping in App Store Connect.",
    policyUrl: requirements.sources.iosScreenshots, fix: "Supply the required iPhone display screenshots and 13-inch iPad screenshots when supporting iPad; verify scaling in App Store Connect.",
    check: (model) => model.locales.filter((locale) => locale.platform === "ios" && locale.screenshots.length)
      .flatMap((locale) => {
        const groups = new Set(locale.screenshots.map((shot) => shot.group));
        const families = model.ios.flatMap((bundle) => Array.isArray(bundle.info.UIDeviceFamily) ? bundle.info.UIDeviceFamily : []);
        const issues = [];
        if ((!families.length || families.includes(1))
          && !["iphone-dynamic-medium", "iphone-dynamic-large", "iphone-face-large"].some((group) => groups.has(group))) {
          issues.push({ file: locale.directory, message: "No current required/scalable iPhone screenshot group was detected." });
        }
        if (families.includes(2) && !groups.has("ipad-13")) {
          issues.push({ file: locale.directory, message: "iPad support detected without a 13-inch iPad screenshot." });
        }
        return issues;
      }),
  }),
];
