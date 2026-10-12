import { BuildCommand, Command, Service, ServiceParameters, useApplication } from "@webda/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateSdk, type GenerateSdkOptions } from "./generate/index.js";
import { SdkManifestBuilder, type SdkManifest } from "./manifest.js";

/** Default modules a `@Shared` method may import from */
export const DEFAULT_SHARED_IMPORTS = ["@webda/utils", "@webda/ql"];

/**
 * Parameters of the SDK generator
 */
export class SdkGeneratorParameters extends ServiceParameters {
  /**
   * Folder the SDK is written to, relative to the application
   * @default ".webda/sdk"
   */
  outDir: string;
  /**
   * Operation id globs to include (`Task.*`, `Tasks.Query`, `Auth.*`)
   * @default every operation
   */
  include?: string[];
  /**
   * Operation id globs to exclude (`*.Delete`)
   */
  exclude?: string[];
  /**
   * Emit `models.ts` and the model clients
   * @default true
   */
  models: boolean;
  /**
   * Write a `package.json` so the folder is a workspace package
   */
  package?: { name: string; version?: string };
  /**
   * Modules a `@Shared` method may import from (also read by the compiler)
   * @default ["@webda/utils", "@webda/ql"]
   */
  sharedImports: string[];
  /**
   * Exposures to describe in the manifest
   * @default every configured transport service
   */
  transports?: Array<"rest" | "graphql" | "grpc">;
  /**
   * Describe the `SyncService` in the manifest
   * @default true when one is configured
   */
  offline?: boolean;
  /**
   * `json-schema-to-typescript` options passthrough
   */
  types?: Record<string, unknown>;

  /**
   * @param params - raw parameters
   * @returns this with the defaults
   */
  load(params: any = {}): this {
    super.load(params);
    this.outDir ??= ".webda/sdk";
    this.models ??= true;
    this.sharedImports ??= [...DEFAULT_SHARED_IMPORTS];
    return this;
  }
}

/**
 * Generate the typed frontend SDK of the application
 *
 * `webdac build` runs it through the build hook, `webda sdk generate` on demand; `webda sdk manifest` prints the
 * manifest the generator works from.
 *
 * @WebdaModda
 */
export class SdkGenerator<T extends SdkGeneratorParameters = SdkGeneratorParameters> extends Service<T> {
  /**
   * @param params - raw service parameters
   * @returns the parameters
   */
  static createConfiguration(params: any = {}): SdkGeneratorParameters {
    return new SdkGeneratorParameters().load(params);
  }

  /**
   * @returns the manifest of the application, filtered by the parameters
   */
  manifest(): SdkManifest {
    return new SdkManifestBuilder({
      include: this.parameters.include,
      exclude: this.parameters.exclude,
      transports: this.parameters.transports,
      offline: this.parameters.offline
    }).build();
  }

  /**
   * @returns the generation options from the parameters
   */
  protected generateOptions(): GenerateSdkOptions {
    return {
      models: this.parameters.models,
      package: this.parameters.package,
      types: this.parameters.types as GenerateSdkOptions["types"]
    };
  }

  /**
   * Generate the SDK files
   * @returns file name to content
   */
  async files(): Promise<Record<string, string>> {
    return generateSdk(this.manifest(), this.generateOptions());
  }

  /**
   * Generate the SDK into a folder
   * @param outDir - the folder, relative to the application @default the `outDir` parameter
   * @returns the absolute folder
   */
  async write(outDir: string = this.parameters.outDir): Promise<string> {
    const folder = resolve(useApplication().getPath(), outDir);
    const files = await this.files();
    for (const [name, content] of Object.entries(files)) {
      const path = resolve(folder, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
    }
    this.log("INFO", `Generated SDK in ${folder}: ${Object.keys(files).join(", ")}`);
    return folder;
  }

  /**
   * Build hook: generate the SDK on `webdac build`
   */
  @BuildCommand({ description: "Generate the frontend SDK", requires: ["rest-domain"] })
  async build(): Promise<void> {
    await this.write();
  }

  /**
   * Generate the SDK on demand
   * @param outDir - the folder, relative to the application; the `outDir` parameter by default
   */
  @Command("sdk generate", { description: "Generate the frontend SDK", requires: ["rest-domain"], phase: "resolved" })
  async generate(outDir?: string): Promise<void> {
    await this.write(outDir ?? this.parameters.outDir);
  }

  /**
   * Print the SDK manifest, the input of the generator
   */
  @Command("sdk manifest", { description: "Print the SDK manifest", requires: ["rest-domain"], phase: "resolved" })
  async printManifest(): Promise<void> {
    // The manifest is the command's output, not a log line
    process.stdout.write(`${JSON.stringify(this.manifest(), null, 2)}\n`);
  }
}
