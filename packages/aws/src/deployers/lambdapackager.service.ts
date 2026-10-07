import {
  Application,
  Command,
  Deployer,
  getDeploymentVariables,
  PACKAGED_CONFIGURATION,
  packageApplication,
  PackageOptions,
  resolveDeploymentVariables,
  Service,
  ServiceParameters,
  useApplication
} from "@webda/core";
import { statSync } from "node:fs";
import * as path from "node:path";
import { writeZip, ZipEntry } from "./zip.js";

/**
 * Type of the service handling the Lambda invocations in the package
 */
export const LAMBDA_SERVER_TYPE = "Webda/LambdaServer";

/**
 * Options to build a Lambda package
 */
export interface LambdaPackageOptions {
  /**
   * Path of the zip to create
   *
   * @default "dist/lambda.zip"
   */
  zipPath?: string;
  /**
   * File to add as `entrypoint.js` at the root of the package
   *
   * The default handler is `node_modules/@webda/aws/lib/deployers/lambda-entrypoint.handler`
   * so it is not needed
   */
  entrypoint?: string;
  /**
   * The application includes its own aws-sdk v2: by default `aws-sdk` is excluded
   *
   * @default false
   */
  customAwsSdk?: boolean;
  /**
   * How to select the files of the application
   */
  package?: PackageOptions;
}

/**
 * Result of a Lambda package
 */
export interface LambdaPackageResult {
  /**
   * Path of the zip
   */
  zipPath: string;
  /**
   * Number of files in the zip
   */
  files: number;
  /**
   * Size of the zip in bytes
   */
  size: number;
}

/**
 * Default handler of the Lambda function
 */
export const LAMBDA_DEFAULT_HANDLER = "node_modules/@webda/aws/lib/deployers/lambda-entrypoint.handler";

/**
 * Create the Lambda zip of the application
 *
 * The package contains the application files, its production dependencies and the
 * configuration of the current deployment. A `LambdaServer` service is added to the
 * configuration if none is defined, as the default handler relies on it.
 *
 * @param app - the application
 * @param options - the package options
 * @returns the zip information
 */
export async function createLambdaPackage(
  app: Application,
  options: LambdaPackageOptions = {}
): Promise<LambdaPackageResult> {
  const zipPath = path.resolve(app.applicationPath, options.zipPath ?? "dist/lambda.zip");
  const packageOptions: PackageOptions = {
    ...options.package,
    // Do not package a previous package
    ignores: [...(options.package?.ignores ?? []), path.relative(app.applicationPath, zipPath).split(path.sep)[0]],
    modules: {
      includes: options.package?.modules?.includes ?? [],
      excludes: [...(options.package?.modules?.excludes ?? []), ...(options.customAwsSdk ? [] : ["aws-sdk"])]
    }
  };
  const { files, configuration } = await packageApplication(app, packageOptions);
  configuration.services ??= {};
  const hasLambdaServer = Object.values<any>(configuration.services).some(
    service => service?.type === LAMBDA_SERVER_TYPE || service?.type === "LambdaServer"
  );
  if (!hasLambdaServer) {
    configuration.services["LambdaServer"] = { type: LAMBDA_SERVER_TYPE };
  }
  const entries: ZipEntry[] = files.map(file =>
    file.target === PACKAGED_CONFIGURATION
      ? { target: file.target, content: JSON.stringify(configuration, undefined, 2) }
      : { target: file.target, source: file.source, content: file.content, mode: file.mode }
  );
  if (options.entrypoint) {
    entries.push({ target: "entrypoint.js", source: path.resolve(app.applicationPath, options.entrypoint) });
  }
  writeZip(zipPath, entries);
  return { zipPath, files: entries.length, size: statSync(zipPath).size };
}

/**
 * Lambda Packager parameters
 */
export class LambdaPackagerParameters extends ServiceParameters implements LambdaPackageOptions {
  /**
   * Name of the unit
   */
  name?: string;
  /**
   * Path of the zip to create
   *
   * @default "dist/lambda-${package.version}.zip"
   */
  zipPath?: string;
  /**
   * File to add as `entrypoint.js` at the root of the package
   */
  entrypoint?: string;
  /**
   * The application includes its own aws-sdk v2
   *
   * @default false
   */
  customAwsSdk?: boolean;
  /**
   * How to select the files of the application
   */
  package?: PackageOptions;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.zipPath ??= "dist/lambda-${package.version}.zip";
    return this;
  }
}

/**
 * Package the application as an AWS Lambda zip
 *
 * Declared as a unit of a deployment, `webda -d <deployment> aws package` creates the zip
 * with the configuration of the deployment.
 *
 * @WebdaModda
 */
export class LambdaPackager<T extends LambdaPackagerParameters = LambdaPackagerParameters>
  extends Service<T>
  implements Deployer
{
  /**
   * Application to package
   * @returns the current application
   */
  protected getApplication(): Application {
    return useApplication();
  }

  /**
   * Create the Lambda zip
   *
   * @returns the zip information
   */
  @Command("aws package", {
    description: "Package the application as an AWS Lambda zip",
    phase: "resolved"
  })
  async package(): Promise<LambdaPackageResult> {
    const raw = JSON.parse(JSON.stringify(this.getParameters()));
    const options: LambdaPackageOptions = resolveDeploymentVariables(raw, getDeploymentVariables(this));
    const result = await createLambdaPackage(this.getApplication(), options);
    this.log("INFO", `Lambda package ${result.zipPath} created: ${result.files} files, ${result.size} bytes`);
    return result;
  }
}
