import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach } from "vitest";
import { configSchema } from "../src/config.ts";
import type { AndroidApp, IosBundle, ProjectModel, RuleContext, StoreLocale } from "../src/types.ts";

export const config = configSchema.parse({});
export const context: RuleContext = {
  defaultLocale: "en-US", androidDevice: "phone", now: new Date("2026-11-09T12:00:00Z"),
};
export const model = (override: Partial<ProjectModel> = {}): ProjectModel => ({
  root: "/project", sources: [], ios: [], privacy: [], android: [], locales: [], diagnostics: [], ...override,
});
export const ios = (override: Partial<IosBundle> = {}): IosBundle => ({
  file: "App/Info.plist", name: "App", configuration: "Release",
  info: {}, version: "1.0.0", build: "1", ...override,
});
export const android = (override: Partial<AndroidApp> = {}): AndroidApp => ({
  file: "app/build.gradle.kts", manifestFile: "app/src/main/AndroidManifest.xml",
  manifest: { application: {} }, targetSdk: 36, versionCode: 2, versionName: "1.0.0",
  previousVersionCode: 1, ...override,
});
export const locale = (override: Partial<StoreLocale> = {}): StoreLocale => ({
  platform: "ios", locale: "en-US", directory: "fastlane/metadata/en-US",
  fields: {
    name: { file: "name.txt", value: "Sample app" },
    keywords: { file: "keywords.txt", value: "release,check" },
    description: { file: "description.txt", value: "A useful application." },
  },
  screenshots: [{ file: "shot.png", group: "iphone-dynamic-medium", width: 1179, height: 2556 }],
  ...override,
});

const temporary: string[] = [];
afterEach(async () => {
  for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
});

export async function tempProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "berthlint-test-"));
  temporary.push(root);
  return root;
}

export async function put(root: string, file: string, contents: string | Buffer): Promise<void> {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export function png(width: number, height: number): Buffer {
  function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((width * 3 + 1) * height))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
