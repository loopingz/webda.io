import {
  Application,
  Command,
  CronService,
  Deployer,
  getDeploymentVariables,
  PACKAGED_CONFIGURATION,
  packageApplication,
  PackageOptions,
  resolveDeploymentVariables,
  Service,
  ServiceParameters,
  useApplication,
  useCore,
  writeZip,
  ZipEntry
} from "@webda/core";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { functionsSchedule } from "../template.js";
import type { AzureTrigger } from "./functions-entrypoint.js";

export interface AzureFunctionsPackageOptions {
  zipPath?: string;
  package?: PackageOptions;
  crons?: { id: string; schedule: string }[];
  triggers?: AzureTrigger[];
}
export interface AzureFunctionsPackageResult {
  zipPath: string;
  files: number;
  size: number;
}

/**
 * Package a Webda application for the Azure Functions Node v4 programming model.
 * @param application - Webda application to package
 * @param options - Encryption or packaging options
 * @returns Archive path, size and file count
 */
export async function createAzureFunctionsPackage(
  application: Application,
  options: AzureFunctionsPackageOptions = {}
): Promise<AzureFunctionsPackageResult> {
  const zipPath = resolve(application.applicationPath, options.zipPath ?? "dist/azure-functions.zip");
  const packaged = await packageApplication(application, {
    ...options.package,
    ignores: [...(options.package?.ignores ?? []), relative(application.applicationPath, zipPath).split(sep)[0]],
    modules: {
      includes: [...new Set(["@webda/azure", "@azure/functions", ...(options.package?.modules?.includes ?? [])])],
      excludes: options.package?.modules?.excludes
    }
  });
  const configuration = packaged.configuration;
  // Packaging can be called for an app that has not loaded this module. Install the generated server
  // definition in its cached modules so the default adapter resolves during packaged boot.
  const manifest = JSON.parse(readFileSync(new URL("../../webda.module.json", import.meta.url), "utf8"));
  const modules = (configuration.cachedModules ??= {} as NonNullable<typeof configuration.cachedModules>);
  modules.moddas ??= {};
  if (!modules.moddas["Webda/AzureFunctionServer"]) {
    const definition = { ...manifest.moddas["Webda/AzureFunctionServer"] };
    for (const key of ["Import", "Configuration"]) definition[key] = `node_modules/@webda/azure/${definition[key]}`;
    modules.moddas["Webda/AzureFunctionServer"] = definition;
  }
  configuration.services ??= {};
  if (
    !Object.values<any>(configuration.services).some(service =>
      ["AzureFunctionServer", "Webda/AzureFunctionServer"].includes(service?.type)
    )
  )
    configuration.services.AzureFunctionServer = { type: "Webda/AzureFunctionServer" };
  const crons = (options.crons ?? []).map(cron => ({ ...cron, schedule: functionsSchedule(cron.schedule) }));
  const triggers = (options.triggers ?? []).map(trigger =>
    trigger.type === "timer" ? { ...trigger, schedule: functionsSchedule(trigger.schedule) } : trigger
  );
  const entries: ZipEntry[] = [];
  for (const file of packaged.files) {
    if (["host.json", "webda-functions.mjs", "local.settings.json"].includes(file.target)) continue;
    if (file.target === PACKAGED_CONFIGURATION)
      entries.push({ target: file.target, content: JSON.stringify(configuration, null, 2) });
    else if (file.target === "package.json") {
      const descriptor = JSON.parse(file.content ?? readFileSync(file.source!, "utf8"));
      // Dependencies are already packaged; prevent a host-side install of workspace/dev references.
      delete descriptor.devDependencies;
      delete descriptor.scripts;
      delete descriptor.workspaces;
      delete descriptor.packageManager;
      descriptor.main = "webda-functions.mjs";
      entries.push({ target: "package.json", content: JSON.stringify(descriptor, null, 2) });
    } else entries.push(file);
  }
  entries.push({
    target: "host.json",
    content: JSON.stringify(
      {
        version: "2.0",
        extensions: { http: { routePrefix: "" } },
        extensionBundle: { id: "Microsoft.Azure.Functions.ExtensionBundle", version: "[4.*, 5.0.0)" }
      },
      null,
      2
    )
  });
  entries.push({
    target: "webda-functions.mjs",
    content: `import "@webda/azure";\nimport { registerAzureFunctions } from "@webda/azure/lib/deployers/functions-entrypoint.js";\nregisterAzureFunctions(${JSON.stringify(crons)}, ${JSON.stringify(triggers)});\n`
  });
  writeZip(zipPath, entries);
  return { zipPath, files: entries.length, size: statSync(zipPath).size };
}

/**
 *
 */
export class AzureFunctionsPackagerParameters extends ServiceParameters implements AzureFunctionsPackageOptions {
  zipPath = "dist/azure-functions.zip";
  package?: PackageOptions;
  triggers?: AzureTrigger[];
}

/** Build a reproducible Azure Functions deployment archive.
 * @WebdaModda
 */
export class AzureFunctionsPackager extends Service<AzureFunctionsPackagerParameters> implements Deployer {
  static Parameters = AzureFunctionsPackagerParameters;

  /**
   * Create the Functions archive with the declared cron timers.
   * @returns The package result
   */
  @Command("azure package", { description: "Package the application for Azure Functions" })
  async package(): Promise<AzureFunctionsPackageResult> {
    const options = resolveDeploymentVariables(this.parameters, getDeploymentVariables(this));
    const crons = CronService.loadAnnotations(useCore().getServices()).map(cron => ({
      id: CronService.getExportId(cron),
      schedule: cron.cron
    }));
    return createAzureFunctionsPackage(useApplication(), { ...options, crons });
  }
}
