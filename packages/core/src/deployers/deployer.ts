import { spawn } from "node:child_process";
import { useLog, type WorkerLogLevel } from "@webda/workout";
import { useApplication } from "../application/hooks.js";
import type { GitInformation, PackageDescriptor, WebdaPackageDescriptor } from "../application/iconfiguration.js";
import { replaceVariables } from "../templates/templates.js";
import { getGitInformation } from "./git.js";

/**
 * Capability of the services that deploy the application
 */
export const DEPLOYER_CAPABILITY = "deployer";

/**
 * A service that deploys the application: its commands (`deploy`, `package`, ...) run
 * on the `units` of the selected deployment.
 *
 * Deployers are never part of the application services: the CLI adds the units of the
 * selected deployment (`webda -d <deployment> <command>`) as services only when one of
 * their commands runs, and never injects a deployer by default.
 *
 * Every deployer class declares `implements Deployer` itself, the compiler only reads the
 * capability from the class own heritage clauses.
 *
 * @example
 * ```typescript
 * export class MyDeployer extends Service<MyDeployerParameters> implements Deployer {
 *   @Command("deploy", { description: "Deploy my resources" })
 *   async deploy() {
 *     const parameters = resolveDeploymentVariables(this.parameters, getDeploymentVariables(this));
 *   }
 * }
 * ```
 *
 * @WebdaCapability deployer
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Deployer {}

/**
 * Variables available to the `${...}` templates of a deployer
 */
export interface DeploymentVariables {
  /**
   * Name of the current deployment, empty if none
   */
  deployment: string;
  /**
   * The deployer: unit name and service type
   */
  deployer: { name: string; type: string };
  /**
   * Parameters of the deployer, before replacement
   */
  resources: Record<string, any>;
  /**
   * package.json of the application
   */
  package: PackageDescriptor;
  /**
   * Webda configuration of the package.json, merged with the workspace one
   */
  webda: WebdaPackageDescriptor;
  /**
   * Git information of the application repository
   */
  git: GitInformation;
  /**
   * Environment variables, for secrets from the CI
   */
  env: Record<string, string | undefined>;
  /**
   * Current timestamp
   */
  now: number;
  /**
   * Additional variables
   */
  [key: string]: any;
}

/**
 * The part of a deployer service used by {@link getDeploymentVariables}
 */
export interface DeployerInstance {
  /**
   * Name of the service, the unit name
   */
  getName(): string;
  /**
   * Parameters of the service
   */
  getParameters?(): any;
}

/**
 * Collect the variables for the templates of a deployer
 *
 * @param deployer - the deployer service, for `deployer` and `resources`
 * @param extra - additional variables, overriding the default ones
 * @returns the variables
 */
export function getDeploymentVariables(
  deployer?: DeployerInstance,
  extra: Record<string, any> = {}
): DeploymentVariables {
  const app = useApplication();
  const project = app.getProjectInfo();
  const packageDescription: PackageDescriptor = project?.package ?? ({} as PackageDescriptor);
  const name = deployer?.getName() ?? "";
  return {
    deployment: app.getCurrentDeployment() ?? "",
    deployer: { name, type: app.getConfiguration().services?.[name]?.type },
    resources: deployer?.getParameters?.() ?? {},
    package: packageDescription,
    webda: project?.webda ?? {},
    git: getGitInformation(app.applicationPath ?? process.cwd(), packageDescription.name, packageDescription.version),
    env: process.env,
    now: Date.now(),
    ...extra
  };
}

/**
 * Replace the `${...}` templates of a deployer parameters
 *
 * @param object - the string or object to resolve, not modified
 * @param variables - the variables from {@link getDeploymentVariables}
 * @returns a copy with the templates replaced
 */
export function resolveDeploymentVariables<T>(object: T, variables: DeploymentVariables): T {
  return replaceVariables(object, variables);
}

/**
 * Result of {@link runCommand}
 */
export interface CommandResult {
  /**
   * Exit code
   */
  status: number;
  /**
   * Standard output
   */
  output: string;
  /**
   * Standard error
   */
  error: string;
}

/**
 * Options of {@link runCommand}
 */
export interface RunCommandOptions {
  /**
   * Content to write on the standard input
   */
  stdin?: string;
  /**
   * Working directory
   */
  cwd?: string;
  /**
   * Additional environment variables
   */
  env?: Record<string, string>;
  /**
   * Resolve instead of rejecting when the exit code is not 0
   */
  resolveOnError?: boolean;
  /**
   * Log level of the standard output
   *
   * @default "TRACE"
   */
  logLevel?: WorkerLogLevel;
}

/**
 * Run a shell command, logging its output
 *
 * @param command - the shell command
 * @param options - the options
 * @returns the exit code and outputs, rejects with the same object when the exit code is not 0
 */
export function runCommand(command: string, options: RunCommandOptions = {}): Promise<CommandResult> {
  const { stdin, cwd, env, resolveOnError = false, logLevel = "TRACE" } = options;
  useLog("DEBUG", "Command", command, stdin ? `with stdin <<EOF\n${stdin}\nEOF\n` : "");
  return new Promise((resolve, reject) => {
    const result: CommandResult = { status: 0, output: "", error: "" };
    const child = spawn(command, { shell: true, cwd, env: env ? { ...process.env, ...env } : process.env });
    child.stdout.on("data", data => {
      useLog(logLevel, data.toString());
      result.output += data.toString();
    });
    child.stderr.on("data", data => {
      useLog("ERROR", data.toString());
      result.error += data.toString();
    });
    child.on("error", reject);
    child.on("close", code => {
      result.status = code ?? 1;
      if (result.status === 0 || resolveOnError) {
        resolve(result);
      } else {
        reject(result);
      }
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}
