#!/usr/bin/env node
import yargs, { type Argv, type Options } from "yargs";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JSONSchema7 } from "json-schema";
import { Application, installConfigurationFactories } from "../application/application.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import {
  collectServiceCommands,
  getCliConfiguration,
  executeServiceCommand,
  selectOperations,
  type ServiceCommandInfo,
  type ServiceCommandTarget
} from "../services/servicecommands.js";
import { getDeploymentUnitServices, mergeDeploymentUnits } from "../application/deployment.js";
import { DEPLOYER_CAPABILITY } from "../deployers/deployer.js";
import * as WebdaError from "../errors/errors.js";
import { Core } from "../core/core.js";
import { STORE_CAPABILITY } from "../stores/capability.js";
import { bootCoreForCommand, executeApplicationCommand, selectPhase } from "./cli-phase.js";
import { runDryRun } from "../contexts/execution.js";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { CancelablePromise, parseImportDescriptor, toImportSpecifier } from "@webda/utils";
import {
  ConsoleLogger,
  type ConsoleLogStream,
  patchConsole,
  useLog,
  useLogLevel,
  useOutput,
  useWorkerOutput
} from "@webda/workout";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";

/**
 * Operation entry from operations.json
 */
export interface OperationEntry {
  id: string;
  input: string;
  output: string;
}

/**
 * Format of the .webda/operations.json file
 */
export interface OperationsFile {
  operations: Record<string, OperationEntry>;
  schemas: Record<string, JSONSchema7>;
}

/**
 * Parsed operation call ready for execution
 */
export interface OperationCall {
  /** Operation ID (e.g., "Task.Create") */
  id: string;
  /** Parsed parameters (e.g., { uuid: "abc123" }) */
  parameters: Record<string, any>;
  /** Parsed input body */
  input?: any;
  /** Whether dry run is requested */
  dryRun?: boolean;
}

export type OperationHandler = (call: OperationCall) => Promise<void>;

/**
 * Well-known parameter schemas mapped to yargs positionals/options
 */
const KNOWN_PARAMS: Record<string, { positional?: string; options?: Record<string, Options> }> = {
  uuidRequest: {
    positional: "uuid"
  },
  searchRequest: {
    options: {
      query: { type: "string", alias: "q", describe: "Search query (WebdaQL)" }
    }
  }
};

/**
 * The well-known parameter mapping of an operation input
 *
 * An instance action's request schema (`x-webda-arguments` starting with `uuid`) takes the object
 * uuid as positional and its other properties as options, like `uuidRequest` plus a body.
 * @param op - the operation
 * @param ops - the operations file
 * @returns the positional/options mapping, `request: true` for an instance action request schema
 */
function paramDefOf(
  op: OperationEntry,
  ops: OperationsFile
): { positional?: string; options?: Record<string, Options>; request?: boolean } | undefined {
  if (!op.input || op.input === "void") return undefined;
  if (KNOWN_PARAMS[op.input]) return KNOWN_PARAMS[op.input];
  if ((ops.schemas[op.input] as any)?.["x-webda-arguments"]?.[0] === "uuid") {
    return { positional: "uuid", request: true };
  }
  return undefined;
}

/**
 * Convert a JSON Schema's properties into yargs option definitions.
 *
 * @param schema - JSON Schema describing an object with properties
 * @param skipRequired - When true, all options are marked optional (useful when input can also come from --json/--file)
 * @returns Map of property names to yargs {@link Options} definitions
 */
function schemaToOptions(schema: JSONSchema7, skipRequired?: boolean): Record<string, Options> {
  if (schema.type !== "object" || !schema.properties) return {};
  const opts: Record<string, Options> = {};
  const required = new Set(schema.required || []);
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (typeof prop === "boolean") continue;
    const o: Options = { describe: prop.description || name, demandOption: skipRequired ? false : required.has(name) };
    if (prop.type === "number" || prop.type === "integer") o.type = "number";
    else if (prop.type === "boolean") o.type = "boolean";
    else if (prop.type === "array") o.type = "array";
    else o.type = "string";
    if (prop.enum) o.choices = prop.enum as string[];
    if (prop.default !== undefined) o.default = prop.default;
    opts[name] = o;
  }
  return opts;
}

/**
 * Load .webda/operations.json from an application directory
 * @param appPath - the application path
 * @returns the result
 */
export function loadOperations(appPath: string = "."): OperationsFile {
  const filePath = join(resolve(appPath), ".webda", "operations.json");
  if (!existsSync(filePath)) {
    throw new Error(`Operations not found: ${filePath}\nRun 'webdac build' to generate it.`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/**
 * Group operations by their prefix before the first dot (e.g., "Task.Create" belongs to group "Task").
 *
 * @param operations - Map of operation IDs to their entries
 * @returns Map of group names to their operation entries
 */
function groupOperations(operations: Record<string, OperationEntry>): Map<string, OperationEntry[]> {
  const groups = new Map<string, OperationEntry[]>();
  for (const op of Object.values(operations)) {
    const dot = op.id.indexOf(".");
    const group = dot >= 0 ? op.id.substring(0, dot) : op.id;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(op);
  }
  return groups;
}

/**
 * Add parameter and input options to a yargs command
 * @param y - the yargs instance
 * @param op - the operation
 * @param ops - the operations list
 * @returns the result
 */
function addOperationOptions(y: Argv, op: OperationEntry, ops: OperationsFile): Argv {
  const hasInput = op.input && op.input !== "void";
  const paramDef = paramDefOf(op, ops);

  // Add well-known parameter options (e.g., uuidRequest -> positional uuid)
  if (paramDef?.options) {
    for (const [name, opt] of Object.entries(paramDef.options)) {
      y.option(name, opt);
    }
  }

  // Add custom input options from schema
  if (hasInput && (!paramDef || paramDef.request) && ops.schemas[op.input]) {
    // Offer both raw JSON/file and per-property CLI options
    y.option("json", { type: "string", describe: "JSON input (inline)" });
    y.option("file", { type: "string", alias: "f", describe: "JSON input from file" });
    for (const [name, opt] of Object.entries(schemaToOptions(ops.schemas[op.input], true))) {
      // The positional is not an option
      if (name === paramDef?.positional) continue;
      y.option(name, opt);
    }
  }

  return y;
}

/**
 * Extract operation parameters from parsed CLI args using well-known param defs or custom schemas.
 *
 * @param args - Parsed yargs arguments
 * @param op - The operation entry defining which parameters to extract
 * @param ops - The full operations file (for resolving custom parameter schemas)
 * @returns Object containing only the recognized parameter values
 */
function extractParameters(args: Record<string, any>, op: OperationEntry, ops: OperationsFile): Record<string, any> {
  const params: Record<string, any> = {};
  const paramDef = paramDefOf(op, ops);

  if (paramDef?.positional && args[paramDef.positional] !== undefined) {
    params[paramDef.positional] = args[paramDef.positional];
  }
  if (paramDef?.options) {
    for (const name of Object.keys(paramDef.options)) {
      if (args[name] !== undefined) params[name] = args[name];
    }
  }

  return params;
}

/**
 * Extract operation input body from parsed CLI args (via --json, --file, or individual schema properties).
 *
 * @param args - Parsed yargs arguments
 * @param op - The operation entry defining the input schema
 * @param ops - The full operations file (for resolving input schemas)
 * @returns Parsed input object, or undefined if no input was provided
 */
function extractInput(args: Record<string, any>, op: OperationEntry, ops: OperationsFile): any | undefined {
  const hasInput = op.input && op.input !== "void";
  // When input is a well-known param schema (e.g., uuidRequest), it is handled
  // via extractParameters and positional args, not as body input.
  if (hasInput && KNOWN_PARAMS[op.input]) {
    return undefined;
  }
  if (args.json) {
    return JSON.parse(args.json as string);
  }
  if (args.file) {
    return JSON.parse(readFileSync(args.file as string, "utf-8"));
  }
  // Build input from individual CLI options matching the input schema properties
  if (hasInput && ops.schemas[op.input]?.properties) {
    const input: Record<string, any> = {};
    const positional = paramDefOf(op, ops)?.positional;
    for (const name of Object.keys(ops.schemas[op.input].properties)) {
      if (name !== positional && args[name] !== undefined) input[name] = args[name];
    }
    if (Object.keys(input).length > 0) return input;
  }
  return undefined;
}

/**
 * Build a yargs CLI from an operations.json file
 *
 * Groups operations by their prefix (e.g., "Task") and creates nested
 * subcommands for each action (e.g., "create", "get", "delete").
 *
 * Usage examples (given Task CRUD operations):
 *   webda task create --json '{"title":"My Task"}'
 *   webda task get <uuid>
 *   webda task delete <uuid>
 *   webda tasks query --query "status = 'active'"
 *
 * @param ops Loaded operations file
 * @param handler Called when an operation command is invoked
 * @param argv Command-line arguments (defaults to process.argv.slice(2))
 * @returns the result
 */
export function buildCli(ops: OperationsFile, handler: OperationHandler, argv?: string[]): Argv {
  const groups = groupOperations(ops.operations);

  // Lowercase command/subcommand args for case-insensitive matching
  // Stop lowercasing at the first flag (--option) or positional value after commands
  const rawArgv = argv ?? process.argv.slice(2);
  const normalizedArgv = rawArgv.map((arg, i) => {
    // Once we hit a flag, stop lowercasing
    if (arg.startsWith("-")) return arg;
    // Stop lowercasing after the first two positional words (command + action)
    const positionalIndex = rawArgv.slice(0, i).filter(a => !a.startsWith("-")).length;
    return positionalIndex < 2 ? arg.toLowerCase() : arg;
  });

  const cli = yargs(normalizedArgv).scriptName("webda").usage("$0 <command> <action> [options]");
  cli.option("dry-run", {
    type: "boolean",
    describe: "Run operation in dry mode"
  });

  for (const [group, operations] of groups) {
    cli.command(group.toLowerCase(), `${group} operations`, groupY => {
      for (const op of operations) {
        const action = op.id.substring(op.id.indexOf(".") + 1).toLowerCase();
        const hasInput = op.input && op.input !== "void";
        const paramDef = paramDefOf(op, ops);

        // Build command string with positional if needed
        const cmd = paramDef?.positional ? `${action} <${paramDef.positional}>` : action;

        groupY.command(
          cmd,
          op.id,
          y => addOperationOptions(y, op, ops),
          async args => {
            await handler({
              id: op.id,
              parameters: extractParameters(args, op, ops),
              input: hasInput ? extractInput(args, op, ops!) : undefined,
              dryRun: args["dry-run"] ? true : undefined
            });
          }
        );
      }
      return groupY.demandCommand(1, `Specify an action for ${group.toLowerCase()}`);
    });
  }

  return cli
    .completion("completion", false as any)
    .demandCommand(1, "Specify a command")
    .help();
}

/**
 * Add service commands (from `@Command` decorators) to a yargs CLI instance.
 *
 * Reads commands from `webda.module.json` via the Application and registers
 * them as yargs commands. Subcommands (space-separated names like `"aws s3"`)
 * are nested as yargs subcommand groups.
 *
 * A global `--service` option is added to filter which services handle a command
 * when multiple services declare the same command name.
 *
 * @param cli - The yargs CLI instance to add commands to
 * @param serviceCommands - Command map from {@link collectServiceCommands}
 * @param handler - Called when a service command is invoked, receives command name and parsed args
 *
 * @example
 * ```typescript
 * import { collectServiceCommands, addServiceCommandsToCli } from "@webda/core";
 *
 * const cmds = collectServiceCommands(app);
 * const cli = yargs().scriptName("webda");
 * addServiceCommandsToCli(cli, cmds, async (cmdName, args) => {
 *   await executeServiceCommand(cmdName, cmds[cmdName], args, core.getServices(), args.service?.split(","));
 * });
 * ```
 * @returns the result
 */
export function addServiceCommandsToCli(
  cli: Argv,
  serviceCommands: { [name: string]: import("../services/servicecommands.js").ServiceCommandInfo },
  handler: (cmdName: string, args: Record<string, any>) => Promise<void>
): Argv {
  // Add global --service filter
  cli.option("service", {
    type: "string",
    description: "Filter command to specific service(s), comma-separated",
    global: true
  });

  addCommandTree(
    cli,
    Object.entries(serviceCommands).map(([name, info]) => ({ name, info, parts: name.split(" ") })),
    [],
    handler
  );

  return cli;
}

/**
 * Register a level of service commands, nesting the subcommands (`config pki generate`) as yargs command groups
 * @param y - the yargs instance of the level
 * @param commands - the commands under this level, with their name split in words
 * @param prefix - the words of this level
 * @param handler - called when a service command is invoked
 */
function addCommandTree(
  y: Argv,
  commands: { name: string; parts: string[]; info: import("../services/servicecommands.js").ServiceCommandInfo }[],
  prefix: string[],
  handler: (cmdName: string, args: Record<string, any>) => Promise<void>
): void {
  const groups = new Map<string, typeof commands>();
  for (const command of commands) {
    const word = command.parts[prefix.length];
    if (!groups.has(word)) groups.set(word, []);
    groups.get(word)!.push(command);
  }
  for (const [word, group] of groups) {
    const leaf = group.find(c => c.parts.length === prefix.length + 1);
    const children = group.filter(c => c.parts.length > prefix.length + 1);
    if (!children.length) {
      // Simple command (no subcommands)
      y.command(
        word,
        leaf.info.description,
        sub => addCommandArgs(sub, leaf.info.args),
        async args => handler(leaf.name, args as Record<string, any>)
      );
      continue;
    }
    // Command group with subcommands
    const path = [...prefix, word].join(" ");
    y.command(word, `${path} commands`, groupY => {
      if (leaf) {
        // The group command itself is reachable as `<group> <group>`
        groupY.command(
          word,
          leaf.info.description,
          sub => addCommandArgs(sub, leaf.info.args),
          async args => handler(leaf.name, args as Record<string, any>)
        );
      }
      addCommandTree(groupY, children, [...prefix, word], handler);
      return groupY.demandCommand(1, `Specify a subcommand for ${path}`);
    });
  }
}

/**
 * Add command argument definitions to a yargs builder.
 * @param y - the yargs instance
 * @returns the result
 */
function addCommandArgs(y: Argv, args: { [name: string]: import("@webda/compiler").CommandArgDefinition }): Argv {
  for (const [argName, argDef] of Object.entries(args)) {
    y.option(argName, {
      type: argDef.type as "string" | "number" | "boolean",
      default: argDef.default,
      alias: argDef.alias,
      description: argDef.description,
      demandOption: argDef.required
    });
  }
  return y;
}

/**
 * Prompt the user interactively for missing input properties.
 * If stdin is not a TTY, returns the input as-is (validation will fail later).
 *
 * @param input - Partially filled input object
 * @param schema - JSON Schema describing expected input properties (used to determine what is missing)
 * @returns The input object augmented with user-provided values, coerced to the expected types
 */
async function promptForMissingInput(input: Record<string, any>, schema: JSONSchema7): Promise<Record<string, any>> {
  if (schema.type !== "object" || !schema.properties) return input;

  // Collect missing properties
  const missing: [string, JSONSchema7][] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (typeof prop === "boolean" || input[name] !== undefined) continue;
    missing.push([name, prop]);
  }
  if (missing.length === 0) return input;

  // Non-interactive: return as-is, let validation report the error
  if (!process.stdin.isTTY) return input;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (question: string): Promise<string> => new Promise(resolve => rl.question(question, resolve));

  try {
    for (const [name, prop] of missing) {
      const typeHint = prop.type ? ` (${prop.type})` : "";
      const description = prop.description || name;
      const answer = await ask(`${description}${typeHint}: `);
      if (answer === "") continue;
      // Coerce to the expected type
      if (prop.type === "number" || prop.type === "integer") {
        input[name] = Number(answer);
      } else if (prop.type === "boolean") {
        input[name] = answer.toLowerCase() === "true" || answer === "1";
      } else {
        input[name] = answer;
      }
    }
  } finally {
    rl.close();
  }
  return input;
}

/**
 * Import the export referenced by a module descriptor (`file[:exportName]`)
 *
 * @param descriptor - absolute import descriptor
 * @returns the exported value
 */
async function importExport(descriptor: string): Promise<any> {
  const { file, exportName } = parseImportDescriptor(descriptor);
  const mod = await import(toImportSpecifier(file.endsWith(".js") ? file : file + ".js"));
  return mod[exportName];
}

/**
 * Ensure a service is available in the app configuration, injecting it if necessary.
 * For beans that aren't registered as moddas, this dynamically imports and registers them.
 *
 * @param app - The application instance whose configuration may be modified
 * @param serviceName - Name (or namespace-qualified name) of the service to ensure
 */
async function ensureServiceInConfig(app: Application, serviceName: string): Promise<void> {
  const appConfig = app.getConfiguration();
  appConfig.services ??= {};
  if (appConfig.services[serviceName]) return;

  const modules = app.getModules();
  for (const section of ["beans", "moddas"] as const) {
    for (const fullName of Object.keys(modules[section] || {})) {
      if (fullName === serviceName || fullName.endsWith(`/${serviceName}`)) {
        appConfig.services[serviceName] = { type: fullName };
        // Beans aren't loaded as moddas by default — register them so Core can find the type
        if (!app.getModdas()[fullName]) {
          const meta = modules[section][fullName];
          const constructor = await importExport(join(resolve(app.getPath()), meta.Import));
          if (constructor) {
            app.getModdas()[fullName] = constructor;
            // Set up filterParameters and createConfiguration like sectionLoader does
            const { ServiceParameters: DefaultParams } = await import("../services/serviceparameters.js");
            let configClass = DefaultParams;
            if (meta.Configuration) {
              configClass = (await importExport(join(resolve(app.getPath()), meta.Configuration))) || DefaultParams;
            }
            installConfigurationFactories(constructor, configClass, meta.Schema);
          }
        }
        return;
      }
    }
  }
}

/**
 * Default handler: prints the operation call as JSON
 * @param call - the function to call
 */
async function defaultHandler(call: OperationCall): Promise<void> {
  useOutput(JSON.stringify(call, undefined, 2));
}

/** Values accepted by the `--log-stream` option */
const LOG_STREAM_CHOICES = ["auto", "stdout", "stderr"] as const;

/**
 * Resolve where log lines go, from the raw CLI arguments
 *
 * `--log-stream=auto` (the default) sends logs to stderr when stdout is not a
 * TTY, so a piped command result stays clean; `stdout` or `stderr` force it.
 * Read from raw argv because the logger is created before yargs parses.
 * @param argv - the raw CLI arguments
 * @param stdoutIsTTY - whether stdout is a terminal
 * @returns the stream for log lines
 */
export function resolveLogStream(argv: string[], stdoutIsTTY: boolean): ConsoleLogStream {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--log-stream=")) {
      value = argv[i].substring("--log-stream=".length);
    } else if (argv[i] === "--log-stream") {
      value = argv[i + 1];
    }
  }
  if (value === "stdout" || value === "stderr") {
    return value;
  }
  return stdoutIsTTY ? "stdout" : "stderr";
}

/**
 * Whether to route `console.*` calls to the logger, from the raw CLI arguments
 * @param argv - the raw CLI arguments
 * @returns false when `--no-console-patch` is given
 */
export function shouldPatchConsole(argv: string[]): boolean {
  return !argv.includes("--no-console-patch") && !argv.includes("--console-patch=false");
}

/**
 * Top-level commands that ship in optional packages, so an unknown command can
 * point to the package to install
 */
const OPTIONAL_COMMANDS: Record<string, string[]> = {
  async: ["@webda/async"],
  auth: ["@webda/auth"],
  aws: ["@webda/aws"],
  container: ["@webda/oci"],
  debug: ["@webda/debug"],
  deploy: ["@webda/aws", "@webda/oci"],
  kubernetes: ["@webda/kubernetes"],
  mcp: ["@webda/mcp"]
};

/**
 * Error shown when the command matches none the application provides
 *
 * @param command - the command typed
 * @param available - top-level commands of the application
 * @param program - the program name
 * @returns the message, with the package to install when the command ships in one
 */
export function unknownCommandMessage(command: string, available: string[], program: string = "webda"): string {
  const lines = [`Unknown command '${command}'.`];
  const packages = OPTIONAL_COMMANDS[command];
  if (packages) {
    lines.push(
      `'webda ${command}' is provided by ${packages.join(" or ")}: add it to your dependencies (pnpm add -D ${packages[0]}).`
    );
  }
  lines.push(
    `Available commands: ${[...new Set(available)].sort().join(", ")}`,
    `Run '${program} --help' for details.`
  );
  return lines.join("\n");
}

/**
 * Load the Application from a path, choosing packaged or unpacked mode based on the presence of `.webda/packaged.json`.
 *
 * @param appPath - Absolute or relative path to the application root directory
 * @returns An {@link Application} (packaged) or {@link UnpackedApplication} instance
 */
function loadApplication(appPath: string): Application {
  if (!existsSync(join(appPath, ".webda", "packaged.json"))) {
    return new UnpackedApplication(appPath);
  }
  return new Application(appPath);
}

/**
 * Ensure services that declare a command exist in the app configuration.
 * If a service type is not already configured, it is injected with a generated name.
 *
 * @param app - The loaded Application
 * @param services - Service targets from the command metadata
 */
export function ensureCommandServices(app: Application, services: ServiceCommandTarget[]): void {
  const appConfig = app.getConfiguration();
  appConfig.services ??= {};
  for (const svc of services) {
    // Deployers only come from the units of the selected deployment, stores only from the configuration
    if (isDeployerType(app, svc.type) || isStoreType(app, svc.type)) {
      continue;
    }
    const hasProvider =
      Object.values(appConfig.services).some(
        (cfg: any) =>
          cfg.type === svc.type || cfg.type === svc.type.split("/").pop() || isSubclassType(app, cfg.type, svc.type)
      ) || appConfig.services[svc.name];
    if (!hasProvider) {
      appConfig.services[svc.name] = { type: svc.type };
    }
  }
}

/**
 * Whether a configured service type is a subclass of the type declaring a command: it inherits the command, so no
 * instance of the declaring type is added (e.g. `Loopingz/AuthorizerService extends Webda/Authentication`)
 *
 * @param app - the loaded Application
 * @param type - the configured service type
 * @param parent - the type declaring the command
 * @returns true when both classes are known and `type` extends `parent`
 */
export function isSubclassType(app: Pick<Application, "getModda">, type: string, parent: string): boolean {
  if (!type || typeof app.getModda !== "function") {
    return false;
  }
  try {
    const clazz: any = app.getModda(type);
    const parentClass: any = app.getModda(parent);
    return typeof clazz === "function" && typeof parentClass === "function" && clazz.prototype instanceof parentClass;
  } catch {
    return false;
  }
}

/**
 * Whether a service type is a store, from its compiled capabilities
 *
 * @param app - the loaded Application
 * @param type - the service type
 * @returns true if the type declares the store capability
 */
export function isStoreType(app: Pick<Application, "getModules">, type: string): boolean {
  const modules = app.getModules?.();
  const entry = modules?.moddas?.[type] ?? modules?.beans?.[type];
  return (entry?.capabilities ?? []).includes(STORE_CAPABILITY);
}

/**
 * Whether a service type is a deployer, from its compiled capabilities
 *
 * @param app - the loaded Application
 * @param type - the service type
 * @returns true if the type declares the deployer capability
 */
export function isDeployerType(app: Pick<Application, "getModules">, type: string): boolean {
  const modules = app.getModules?.();
  const entry = modules?.moddas?.[type] ?? modules?.beans?.[type];
  return (entry?.capabilities ?? []).includes(DEPLOYER_CAPABILITY);
}

/**
 * Global options taking a separate value, used to find the command name in the raw arguments
 */
const GLOBAL_OPTIONS_WITH_VALUE = ["--log-stream", "--service"];

/**
 * Extract the deployment selection from the raw CLI arguments
 *
 * `-d <name>` (or `-d<name>`) selects the deployment when it comes before the command name, so a
 * command keeps its own `-d` alias; `--deployment <name>` (or `--deployment=<name>`) is accepted anywhere.
 *
 * @param argv - the raw CLI arguments
 * @returns the deployment name and the arguments without the deployment option
 */
export function extractDeploymentArgument(argv: string[]): { deployment?: string; argv: string[] } {
  const remaining: string[] = [];
  let deployment: string | undefined;
  let commandSeen = false;
  const valueOf = (option: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new WebdaError.CodeError("DEPLOYMENT_REQUIRED", `Option ${option} requires a deployment name`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      remaining.push(...argv.slice(i));
      break;
    }
    if (arg === "--deployment" || (!commandSeen && arg === "-d")) {
      deployment = valueOf(arg, i++);
    } else if (arg.startsWith("--deployment=")) {
      deployment = arg.substring("--deployment=".length);
    } else if (!commandSeen && arg.startsWith("-d") && !arg.startsWith("--") && arg.length > 2) {
      deployment = arg.substring(2);
    } else {
      // A bare word is the command, unless it is the value of a global option
      if (!arg.startsWith("-") && !GLOBAL_OPTIONS_WITH_VALUE.includes(remaining[remaining.length - 1])) {
        commandSeen = true;
      }
      remaining.push(arg);
    }
  }
  return { deployment, argv: remaining };
}

/**
 * Add the units of the selected deployment that run a command as services
 *
 * Only the units whose type provides the command are added: the deployers are never
 * instantiated for the application commands (serve, debug, ...).
 *
 * @param app - the loaded Application
 * @param cmdName - the command name
 * @param cmdInfo - the command metadata
 * @returns the names of the units added
 * @throws CodeError DEPLOYMENT_REQUIRED if only deployers run the command and no unit does
 */
export function prepareDeploymentUnits(app: Application, cmdName: string, cmdInfo: ServiceCommandInfo): string[] {
  const types = cmdInfo.services.map(svc => svc.type);
  const deployment = app.getDeployment();
  const units = deployment ? getDeploymentUnitServices(deployment, type => app.completeNamespace(type)) : {};
  const selected = Object.fromEntries(Object.entries(units).filter(([, unit]) => types.includes(unit.type)));
  mergeDeploymentUnits(app.getConfiguration(), selected);
  const deployerTypes = types.filter(type => isDeployerType(app, type));
  if (Object.keys(selected).length === 0 && deployerTypes.length > 0 && deployerTypes.length === types.length) {
    if (!deployment) {
      throw new WebdaError.CodeError(
        "DEPLOYMENT_REQUIRED",
        `Command '${cmdName}' is run by deployers: select a deployment with -d <name>`
      );
    }
    throw new WebdaError.CodeError(
      "DEPLOYMENT_REQUIRED",
      `Deployment '${app.getCurrentDeployment()}' has no unit of type ${deployerTypes.join(", ")} for command '${cmdName}'`
    );
  }
  return Object.keys(selected);
}

/**
 * Resolve required capabilities for a command, auto-injecting default providers
 * into the app config if not already configured.
 *
 * @param app - The loaded Application
 * @param requires - Capability names required by the command
 */
export function resolveCapabilities(app: Application, requires: string[]): void {
  if (!requires || requires.length === 0) return;
  const modules = app.getModules();
  const capabilities: Record<string, string> = modules.capabilities || {};
  const appConfig = app.getConfiguration();
  appConfig.services ??= {};

  for (const cap of requires) {
    const serviceType = capabilities[cap];
    if (!serviceType) {
      useLog("WARN", `No provider found for capability '${cap}'`);
      continue;
    }
    // Check if a service with this type is already configured
    const shortName = serviceType.split("/").pop();
    const hasProvider =
      Object.values(appConfig.services).some((cfg: any) => cfg.type === serviceType || cfg.type === shortName) ||
      appConfig.services[shortName];
    if (!hasProvider) {
      appConfig.services[shortName] = { type: serviceType };
    }
  }
}

/**
 * Exit once stdout has flushed what the command wrote
 *
 * A piped stdout is asynchronous: `process.exit` right after a large `useOutput` truncates it.
 * The write callback fires once every previously queued chunk is handed to the system.
 *
 * @param code - exit code
 * @param stdout - stream to flush, replaceable for tests
 * @param exit - process exit, replaceable for tests
 */
export function exitAfterFlush(
  code: number,
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout,
  exit: (code: number) => void = code => process.exit(code)
): void {
  stdout.write("", () => exit(code));
}

/**
 * Shutdown sequence of a CLI command: stop Core once, then exit
 *
 * The command finishing and a signal can both trigger it: only the first call counts.
 *
 * @param core - the Core to stop
 * @param core.stop - stop every service
 * @param exit - process exit, replaceable for tests
 * @returns `shutdown(code)` to stop then exit with the code, and `interrupt()` for SIGINT/SIGTERM
 */
export function createCommandShutdown(
  core: { stop(): Promise<void> },
  exit: (code: number) => void = code => exitAfterFlush(code)
): { shutdown: (code: number) => Promise<void>; interrupt: () => Promise<void> } {
  let stopping: Promise<void> | undefined;
  const shutdown = (code: number): Promise<void> => {
    stopping ??= (async () => {
      try {
        await core.stop();
      } catch (err) {
        useLog("ERROR", "Cannot stop the application", err);
        code ||= 1;
      }
      exit(code);
    })();
    return stopping;
  };
  const interrupt = async (): Promise<void> => {
    // Settle the long-running commands (serve, worker) before stopping Core
    try {
      await CancelablePromise.cancelAll();
    } catch (err) {
      useLog("WARN", "Cannot cancel running processes", err);
    }
    await shutdown(0);
  };
  return { shutdown, interrupt };
}

/**
 * Run `interrupt` once on SIGINT or SIGTERM (Kubernetes stops pods with SIGTERM)
 *
 * Later signals are ignored while shutting down: on a terminal, Ctrl+C reaches both
 * the launcher (which forwards it) and the CLI.
 *
 * @param interrupt - the interruption handler
 */
export function onInterrupt(interrupt: () => Promise<void>): void {
  let interrupted = false;
  const handler = () => {
    if (interrupted) return;
    interrupted = true;
    void interrupt();
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

/**
 * Run a service command until it settles, then shut down with its exit code
 *
 * A command that throws exits with code 1.
 *
 * @param cmdName - the command name, for logs
 * @param execute - run the command and resolve with its exit code
 * @param shutdown - stop Core then exit with the code
 */
export async function settleServiceCommand(
  cmdName: string,
  execute: () => Promise<number>,
  shutdown: (code: number) => Promise<void>
): Promise<void> {
  let exitCode: number;
  try {
    exitCode = await execute();
  } catch (err) {
    useLog("ERROR", `Command '${cmdName}' failed`, err);
    exitCode = 1;
  }
  await shutdown(exitCode);
}

/**
 * Log the outcome of a service command started without waiting for it (watch mode)
 *
 * @param cmdName - the command name, for logs
 * @param execution - the running command, resolving with its exit code
 */
export function reportServiceCommand(cmdName: string, execution: Promise<number>): void {
  execution.then(
    exitCode => {
      if (exitCode !== 0) {
        useLog("ERROR", `Command '${cmdName}' exited with code ${exitCode}`);
      }
    },
    err => useLog("ERROR", `Command '${cmdName}' failed`, err)
  );
}

/**
 * Run a service command with file watching: compiles first, then restarts on changes.
 *
 * @param appPath - application root path
 * @param app - the loaded Application instance
 * @param cmdName - the service command name
 * @param cmdInfo - the command metadata
 * @param args - parsed CLI arguments
 * @param serviceFilter - optional service name filter
 */
async function runWithWatch(
  appPath: string,
  app: Application,
  cmdName: string,
  cmdInfo: import("../services/servicecommands.js").ServiceCommandInfo,
  args: Record<string, any>,
  serviceFilter?: string[]
): Promise<void> {
  const { Compiler, WebdaProject } = await import("@webda/compiler");
  const project = new WebdaProject(resolve(appPath), useWorkerOutput());

  let core: Core | undefined;
  let restarting = false;

  const bootCore = async () => {
    // Reload application to pick up regenerated webda.module.json
    await app.load();
    core = new Core(app);
    await bootCoreForCommand(core, cmdName, cmdInfo);
    // Long-running commands (serve, worker) stay pending until a restart stops Core: do not wait for them
    reportServiceCommand(cmdName, executeServiceCommand(cmdName, cmdInfo, args, core.getServices(), serviceFilter));
  };

  const restart = async () => {
    if (restarting) return;
    restarting = true;
    await useLogLevel("INFO", async () => {
      try {
        if (core) {
          useLog("INFO", "Restarting...");
          await core.stop();
          core = undefined;
        }
        await bootCore();
      } catch (err) {
        useLog("ERROR", "Failed to restart", err.message);
      } finally {
        restarting = false;
      }
    });
  };

  // Subscribe to compiler events
  project.on("compiling", () => {
    useLogLevel("INFO", () => useLog("INFO", "Changes detected, recompiling..."));
  });

  project.on("compilationError", () => {
    useLog("ERROR", "Compilation failed, keeping current server running");
  });

  // On successful compilation + module generation, restart
  let firstBuild = true;
  const firstBuildReady = new Promise<void>(resolveReady => {
    project.on("done", async () => {
      if (firstBuild) {
        firstBuild = false;
        resolveReady();
      } else {
        await restart();
      }
    });
  });

  // Start the compiler in watch mode with reduced log verbosity
  const compiler = new Compiler(project);
  useLogLevel("WARN", () => compiler.watch(() => {}));

  // Wait for initial compilation before booting
  await firstBuildReady;
  await bootCore();

  // Handle SIGINT and SIGTERM
  const { interrupt } = createCommandShutdown({ stop: async () => core?.stop() });
  onInterrupt(async () => {
    compiler.stopWatch();
    await interrupt();
  });

  // Keep process alive
  await new Promise(() => {});
}

/**
 * Options of {@link runCli}
 */
export interface RunCliOptions {
  /**
   * Application folder, the one containing `package.json` and `webda.module.json`
   *
   * @default process.env.WEBDA_APP_PATH, then the current directory
   */
  appPath?: string;
  /**
   * Command-line arguments, without the node executable and the script
   *
   * @default process.argv.slice(2)
   */
  argv?: string[];
  /**
   * Command to run when the arguments name none (no argument, or only options), e.g. `"serve"`
   *
   * `--help` and `--version` alone keep showing the global help and version.
   *
   * @default webda.cli.defaultCommand of the application package.json
   */
  defaultCommand?: string;
  /**
   * Program name shown in `--help`
   *
   * @default webda.cli.name of the application package.json, then "webda"
   */
  name?: string;
}

/**
 * Options that print something instead of running a command: no default command is added before them
 */
const NO_DEFAULT_COMMAND_OPTIONS = ["--help", "--version"];

/**
 * Insert the default command when the arguments name none
 *
 * A bare word is the command, unless it follows an option taking a value: a global one
 * (`--service <names>`), or any option when `commands` is given and the word is not one of them
 * (`--port 3000`). Without `commands`, only arguments that are all options get the default command.
 *
 * @param argv - the CLI arguments, the deployment option already extracted
 * @param defaultCommand - the command to insert, space-separated for a subcommand
 * @param commands - the top-level commands available, to tell an option value from a command
 * @returns the arguments to parse
 */
export function applyDefaultCommand(argv: string[], defaultCommand?: string, commands?: string[]): string[] {
  if (!defaultCommand) {
    return argv;
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      break;
    }
    if (NO_DEFAULT_COMMAND_OPTIONS.includes(arg)) {
      return argv;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    if (commands?.includes(arg)) {
      return argv;
    }
    const previous = argv[i - 1];
    const optionValue =
      previous?.startsWith("-") &&
      !previous.includes("=") &&
      (GLOBAL_OPTIONS_WITH_VALUE.includes(previous) || commands !== undefined);
    if (!optionValue) {
      // A command, even an unknown one: let the CLI report it
      return argv;
    }
  }
  return [...defaultCommand.split(" ").filter(word => word), ...argv];
}

/**
 * Run the Webda CLI: load the application, parse the arguments and run the command
 *
 * This is what the executable generated by `webdac build` from the `webda.cli` section of the
 * application package.json runs:
 *
 * ```js
 * #!/usr/bin/env node
 * import { fileURLToPath } from "node:url";
 * import { runCli } from "@webda/core/lib/bin/cli.js";
 * await runCli({ appPath: fileURLToPath(new URL("..", import.meta.url)) });
 * ```
 *
 * The program name and default command come from `webda.cli` (`name`, `defaultCommand`) unless given
 * in `options`. The command selection of `webda.cli` (`include`, `exclude`) applies to the `webda`
 * command as well, to the service commands and the operation commands alike, see
 * {@link collectServiceCommands} and {@link selectOperations}.
 *
 * The process exits once the command completes (or fails, or is interrupted by SIGINT/SIGTERM).
 *
 * @param options - application folder, arguments, default command and program name
 * @returns once the command is parsed and started (the process exits when it completes)
 */
export async function runCli(options: RunCliOptions = {}): Promise<void> {
  return runCommandLine(options, true);
}

/**
 * Run the CLI
 *
 * @param options - application folder, arguments, default command and program name
 * @param applicationCli - use the program name and default command of the application `webda.cli`
 *   configuration: true through {@link runCli}, false for the `webda` command
 */
async function runCommandLine(options: RunCliOptions, applicationCli: boolean): Promise<void> {
  const appPath = resolve(options.appPath ?? (process.env.WEBDA_APP_PATH || "."));
  const rawArgv = options.argv ?? process.argv.slice(2);
  await runWithInstanceStorage({}, async () => {
    // Ensure console output is available before anything else
    new ConsoleLogger(useWorkerOutput(), undefined, undefined, resolveLogStream(rawArgv, !!process.stdout.isTTY));
    if (shouldPatchConsole(rawArgv)) {
      patchConsole();
    }
    try {
      // The deployment is applied when loading the application
      const { deployment, argv: extractedArgv } = extractDeploymentArgument(rawArgv);
      const app = loadApplication(appPath);
      if (deployment) {
        app.setCurrentDeployment(deployment);
      }
      useInstanceStorage().application = app;
      await app.load();

      // Operation commands, if operations.json exists, selected by webda.cli like the service commands
      const opsPath = join(appPath, ".webda", "operations.json");
      let ops: OperationsFile | undefined = existsSync(opsPath)
        ? JSON.parse(readFileSync(opsPath, "utf-8"))
        : undefined;
      const selection = getCliConfiguration(app);
      const operationIds = ops ? Object.values(ops.operations).map(op => op.id) : [];

      // Collect service commands from webda.module.json
      const serviceCommands = collectServiceCommands(app, selection, operationIds);
      if (ops) {
        const selected = new Set(selectOperations(operationIds, selection));
        ops = {
          ...ops,
          operations: Object.fromEntries(Object.entries(ops.operations).filter(([, op]) => selected.has(op.id)))
        };
      }

      // Track which command was matched so we know whether to boot Core
      let matchedCommand:
        | { type: "operation"; call: OperationCall }
        | { type: "service"; name: string; args: Record<string, any> }
        | undefined;

      // Detect if @webda/compiler is available for --watch support
      let hasCompiler = false;
      try {
        createRequire(join(appPath, "package.json")).resolve("@webda/compiler");
        hasCompiler = true;
      } catch {
        // @webda/compiler not installed
      }

      const available = [
        ...Object.keys(serviceCommands).map(name => name.split(" ")[0]),
        ...(ops ? [...groupOperations(ops.operations).keys()].map(group => group.toLowerCase()) : [])
      ];
      const cliConfiguration = applicationCli ? selection : undefined;
      const cliArgv = applyDefaultCommand(extractedArgv, options.defaultCommand ?? cliConfiguration?.defaultCommand, [
        ...available,
        "completion"
      ]);

      // Build the CLI with operations (if available) and service commands
      const program = options.name ?? cliConfiguration?.name ?? "webda";
      const cli = yargs(cliArgv).scriptName(program).usage("$0 <command> [options]");

      // Extracted from raw argv before loading the application; declared here for --help
      cli.option("deployment", {
        type: "string",
        description: "Deployment to apply (deployments/<name>), also -d <name> before the command or WEBDA_DEPLOYMENT"
      });

      // Logging options are applied from raw argv before parsing; declared here for --help and validation
      cli.option("log-stream", {
        choices: LOG_STREAM_CHOICES,
        default: "auto",
        description: "Where logs go: auto sends them to stderr when stdout is not a TTY"
      });
      cli.option("console-patch", {
        type: "boolean",
        default: true,
        description: "Route console.log/info/warn/error/debug/trace to the logger"
      });
      cli.option("dry-run", {
        type: "boolean",
        describe: "Run operation in dry mode"
      });

      // Add --watch flag only if compiler is available
      if (hasCompiler) {
        cli.option("watch", {
          alias: "w",
          type: "boolean",
          description: "Watch for changes, recompile and restart (requires @webda/compiler)",
          default: false
        });
      }

      // Add service commands (serve, build, etc. from @Command decorators)
      addServiceCommandsToCli(cli, serviceCommands, async (cmdName, args) => {
        matchedCommand = { type: "service", name: cmdName, args };
      });

      // Add operation commands
      if (ops) {
        const groups = groupOperations(ops.operations);
        for (const [group, operations] of groups) {
          cli.command(group.toLowerCase(), `${group} operations`, groupY => {
            for (const op of operations) {
              const action = op.id.substring(op.id.indexOf(".") + 1).toLowerCase();
              const hasInput = op.input && op.input !== "void";
              const paramDef = paramDefOf(op, ops!);
              const cmd = paramDef?.positional ? `${action} <${paramDef.positional}>` : action;
              groupY.command(
                cmd,
                op.id,
                y => addOperationOptions(y, op, ops!),
                async args => {
                  matchedCommand = {
                    type: "operation",
                    call: {
                      id: op.id,
                      parameters: extractParameters(args, op, ops!),
                      input: hasInput ? extractInput(args, op, ops!) : undefined,
                      dryRun: args["dry-run"] ? true : undefined
                    }
                  };
                }
              );
            }
            return groupY.demandCommand(1, `Specify an action for ${group.toLowerCase()}`);
          });
        }
      }

      cli
        .completion("completion", false as any)
        .demandCommand(1, "Specify a command")
        .help();

      const parsed = await cli.parseAsync();

      if (!matchedCommand) {
        // yargs reports a missing command or action itself, but accepts an unknown command silently
        const command = String(parsed._[0] ?? "");
        if (command && !available.includes(command)) {
          console.error(unknownCommandMessage(command, available, program));
        }
        process.exit(1);
      }

      if (matchedCommand.type === "operation") {
        // Execute the operation through Core
        const call = matchedCommand.call;

        // Derive service name and method from the operation ID (e.g. "TestBean.TestOperation")
        const dot = call.id.indexOf(".");
        const serviceName = call.id.substring(0, dot);
        const methodName = call.id.substring(dot + 1, dot + 2).toLowerCase() + call.id.substring(dot + 2);

        // Ensure the operation's service exists in the configuration
        await ensureServiceInConfig(app, serviceName);

        const core = new Core(app);
        onInterrupt(createCommandShutdown(core).interrupt);
        await core.init();

        // Find the service
        const services = core.getServices();
        let service = services[serviceName];
        if (!service) {
          for (const [name, svc] of Object.entries(services)) {
            if (svc?.constructor?.name === serviceName || name.endsWith(`/${serviceName}`)) {
              service = svc;
              break;
            }
          }
        }
        if (!service) {
          useLog("ERROR", `Service '${serviceName}' not found for operation '${call.id}'`);
          process.exit(1);
        }
        if (typeof service[methodName] !== "function") {
          useLog("ERROR", `Method '${methodName}' not found on service '${serviceName}'`);
          process.exit(1);
        }

        // Validate input against JSON schema if the operation defines one
        // If interactive and missing properties, prompt the user
        const opEntry = ops?.operations[call.id];
        if (opEntry?.input && ops.schemas[opEntry.input]) {
          const inputSchema = ops.schemas[opEntry.input];
          call.input = await promptForMissingInput(call.input ?? {}, inputSchema);
          const { registerSchema, validateSchema } = await import("../schemas/hooks.js");
          registerSchema(opEntry.input, inputSchema);
          validateSchema(opEntry.input, call.input);
        }

        // Call the method with input properties as positional arguments
        const inputArgs = call.input ? Object.values(call.input) : [];
        const executeCall = async () => service[methodName](...inputArgs);
        const result = await (call.dryRun ? runDryRun(executeCall) : executeCall());
        if (result !== undefined) {
          useOutput(typeof result === "string" ? result : JSON.stringify(result, undefined, 2));
        }
        await core.stop();
        exitAfterFlush(0);
      } else {
        // Service command: boot Core and execute
        const cmdInfo = serviceCommands[matchedCommand.name];
        const serviceFilter = matchedCommand.args.service?.split(",");

        if (selectPhase(cmdInfo.phases, matchedCommand.name) === "application") {
          // Static method on the loaded application, without Core
          const { name: commandName, args: commandArgs } = matchedCommand;
          await settleServiceCommand(
            commandName,
            () => executeApplicationCommand(app, commandName, cmdInfo, commandArgs, serviceFilter),
            async code => exitAfterFlush(code)
          );
          return;
        }

        // Add the deployment units running this command, then the services required by it
        prepareDeploymentUnits(app, matchedCommand.name, cmdInfo);
        ensureCommandServices(app, cmdInfo.services);

        // Auto-inject capability providers required by this command
        resolveCapabilities(app, cmdInfo.requires);

        if (matchedCommand.args.watch && hasCompiler) {
          await runWithWatch(appPath, app, matchedCommand.name, cmdInfo, matchedCommand.args, serviceFilter);
        } else {
          const core = new Core(app);
          const { shutdown, interrupt } = createCommandShutdown(core);
          onInterrupt(interrupt);
          await bootCoreForCommand(core, matchedCommand.name, cmdInfo);

          // Long-running commands (serve, worker) only settle once stopped or interrupted
          const { name: commandName, args: commandArgs } = matchedCommand;
          await settleServiceCommand(
            commandName,
            () => executeServiceCommand(commandName, cmdInfo, commandArgs, core.getServices(), serviceFilter),
            shutdown
          );
        }
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });
}

/**
 * Whether this module is the script node started, rather than imported by an application executable
 *
 * @returns true when run as `node lib/bin/cli.js` (or through the launcher)
 */
function isRunDirectly(): boolean {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // No script path (node -e, REPL): imported
    return false;
  }
}

// Main entry point when run directly
if (isRunDirectly()) {
  await runCommandLine({}, false);
}
