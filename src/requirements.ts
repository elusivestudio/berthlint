import data from "./requirements/store.v1.json" with { type: "json" };

type IosToolchain = { xcodeMajor: number; minimumDeploymentTarget: string };
const iosToolchains: IosToolchain[] = data.iosToolchains;
export const requirements = { ...data, iosToolchains };

export function iosScreenshotGroup(width: number, height: number): string | undefined {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const restricted = requirements.screenshots.ios.orientationRestricted
    .filter(([w, h]) => w !== undefined && h !== undefined
      && Math.min(w, h) === short && Math.max(w, h) === long);
  if (restricted.length && !restricted.some(([w, h]) => w === width && h === height)) return undefined;
  return Object.entries(requirements.screenshots.ios.groups)
    .find(([, sizes]) => sizes.some(([w, h]) => w === short && h === long))?.[0];
}

export function isAndroidPhoneScreenshot(group: string): boolean {
  return ["phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots"].includes(group);
}
