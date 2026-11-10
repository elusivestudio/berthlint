export type Platform = "ios" | "android" | "all";
export type Severity = "error" | "warning" | "note";
export type JsonObject = Record<string, unknown>;

export interface Location {
  file: string;
  line?: number;
}

export interface Finding extends Location {
  ruleId: string;
  severity: Severity;
  message: string;
  fix: string;
  policyUrl: string;
}

export interface SourceFile {
  file: string;
  platform: "ios" | "android";
  text: string;
}

export interface IosBundle {
  file: string;
  name: string;
  configuration: string;
  project?: string;
  info: JsonObject;
  version?: string;
  build?: string;
  deploymentTarget?: string;
  sourceFiles?: readonly string[];
}

export interface PrivacyManifest {
  file: string;
  data: JsonObject;
}

export interface AndroidApp {
  file: string;
  manifestFile: string;
  manifest: JsonObject;
  targetSdk?: number;
  versionCode?: number;
  versionName?: string;
  previousVersionCode?: number;
}

export interface MetadataField {
  file: string;
  value: string;
}

export interface Screenshot {
  file: string;
  group: string;
  width: number;
  height: number;
}

export interface StoreLocale {
  platform: "ios" | "android";
  locale: string;
  directory: string;
  fields: Readonly<Record<string, MetadataField>>;
  screenshots: readonly Screenshot[];
}

export interface ProjectModel {
  root: string;
  sources: readonly SourceFile[];
  ios: readonly IosBundle[];
  privacy: readonly PrivacyManifest[];
  android: readonly AndroidApp[];
  locales: readonly StoreLocale[];
  diagnostics: readonly Finding[];
}

export interface RuleContext {
  defaultLocale: string;
  androidDevice: "phone" | "wear" | "automotive" | "tv" | "xr";
  now: Date;
  iosSdkVersion?: string;
  xcodeVersion?: string;
}

export interface RuleResult extends Location {
  message: string;
  policyUrl?: string;
}

export interface Rule {
  id: string;
  title: string;
  description?: string | undefined;
  platform: Platform;
  severity: Severity;
  policyUrl: string;
  fix: string;
  check(model: ProjectModel, context: RuleContext): readonly RuleResult[];
}

export interface ShipcheckPlugin {
  rules: readonly Rule[];
}

export interface Report {
  schemaVersion: 1;
  findings: Finding[];
  summary: Record<Severity, number>;
}
