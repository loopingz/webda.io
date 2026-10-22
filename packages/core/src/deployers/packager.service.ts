import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FileUtils } from "@webda/utils";
import type { Application } from "../application/application.js";
import { useApplication } from "../application/hooks.js";
import { useOutput } from "../loggers/hooks.js";
import { Command } from "../services/command.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import * as WebdaError from "../errors/errors.js";
import { getDeployedConfiguration, packageApplication, writeApplicationPackage } from "./packager.js";

/**
 * Package the application with its deployment applied
 *
 * The CLI injects it to run `webda -d <deployment> package`: the package folder only needs
 * `webda serve`, without the deployment files nor a modules scan at startup.
 *
 * @WebdaModda
 */
export class ApplicationPackager<T extends ServiceParameters = ServiceParameters> extends Service<T> {
  /**
   * Application to package
   * @returns the current application
   */
  protected getApplication(): Application {
    return useApplication();
  }

  /**
   * Configuration file the application is loaded from
   * @param app - the application
   * @returns its absolute path, undefined if it has none
   */
  protected getConfigurationFile(app: Application): string | undefined {
    if (app.configurationFile) {
      return resolve(app.configurationFile);
    }
    try {
      return FileUtils.getConfigurationFile(join(app.applicationPath, "webda.config"));
    } catch {
      return undefined;
    }
  }

  /**
   * Write the packaged application, or only its deployed configuration
   *
   * The packager itself is removed from the configuration, as the CLI added it only to run this command.
   * The deployed configuration carries the `$packaged` marker: it runs with `webda serve` as the
   * `webda.config.json` of an application keeping the `node_modules` layout it was generated in.
   *
   * @param output - target folder, or JSON file with configOnly; relative to the application folder
   * @param configOnly - only output the deployed configuration, with the imports of the source tree
   * @param force - allow configOnly to overwrite the configuration file of the application
   * @returns the deployed configuration as JSON with configOnly
   * @throws CodeError PACKAGE_OVERWRITE_CONFIGURATION if configOnly targets the application configuration without force
   */
  @Command("package", { description: "Package the application with its deployment applied", phase: "resolved" })
  async package(
    /** @alias o @description Package folder, or JSON file with --config-only (stdout if omitted) */
    output?: string,
    /** @description Only output the deployed configuration */
    configOnly?: boolean,
    /** @description Allow --config-only to overwrite the configuration file of the application */
    force?: boolean
  ): Promise<string | void> {
    const app = this.getApplication();
    if (!app.getCurrentDeployment()) {
      this.log("WARN", "No deployment selected (-d <deployment>): packaging the base configuration");
    }
    const excludeServices = [this.getName()];
    if (configOnly) {
      const json = JSON.stringify(getDeployedConfiguration(app, { excludeServices, marker: true }), undefined, 2);
      if (output) {
        const target = resolve(app.applicationPath, output);
        // The source configuration would be lost, and the application would load as packaged
        if (!force && target === this.getConfigurationFile(app)) {
          throw new WebdaError.CodeError(
            "PACKAGE_OVERWRITE_CONFIGURATION",
            `${target} is the configuration of the application: use another output or --force`
          );
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, json);
        this.log("INFO", `Deployed configuration written to ${target}`);
      } else {
        useOutput(json);
      }
      return json;
    }
    const target = resolve(app.applicationPath, output ?? "dist/webda");
    const pkg = await packageApplication(app, { excludeServices });
    writeApplicationPackage(pkg, target);
    this.log("INFO", `Application packaged in ${target}: ${pkg.files.length} files`);
  }
}
