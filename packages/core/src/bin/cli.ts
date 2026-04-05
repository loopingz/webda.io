#!/usr/bin/env node
import yargs, { type Argv, type Options } from "yargs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { JSONSchema7 } from "json-schema";
import { isMainModule } from "@webda/tsc-esm";
import { Application } from "../application/application.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import { collectServiceCommands, executeServiceCommand } from "../services/servicecommands.js";
import { Core } from "../core/core.js";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { CancelablePromise } from "@webda/utils";
import { ConsoleLogger, useLog, useWorkerOutput } from "@webda/workout";
import { createInterface } from "node:readline";

/**
 * Operation entry from operations.json
 */
export interface OperationEntry {
  id: string;
  input?: string;
  output?: string;
  parameters?: string;
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
  },
  binaryGetRequest: {
    positional: "uuid",
    options: {
      index: { type: "number", demandOption: true, describe: "Binary index" }
    }
  },
  binaryHashRequest: {
    positional: "uuid",
    options: {
      hash: { type: "string", demandOption: true, describe: "Binary hash" }
    }
  }
};

/**
 * Convert a JSON Schema to yargs options (for custom parameter schemas)
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
 */
export function loadOperations(appPath: string = "."): OperationsFile {
  const filePath = join(resolve(appPath), ".webda", "operations.json");
  if (!existsSync(filePath)) {
    throw new Error(`Operations not found: ${filePath}\nRun 'webdac build' to generate it.`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/**
 * Group operations by their prefix before the dot
 *
 * "Task.Create" → group "Task"
 * "Tasks.Query" → group "Tasks"
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
 */
function addOperationOptions(y: Argv, op: OperationEntry, ops: OperationsFile): Argv {
  const paramDef = op.parameters ? KNOWN_PARAMS[op.parameters] : undefined;

  // Add well-known parameter options
  if (paramDef?.options) {
    for (const [name, opt] of Object.entries(paramDef.options)) {
      y.option(name, opt);
    }
  }

  // Add custom parameter options from schema
  if (op.parameters && !paramDef && ops.schemas[op.parameters]) {
    for (const [name, opt] of Object.entries(schemaToOptions(ops.schemas[op.parameters]))) {
      y.option(name, opt);
    }
  }

  // Input: raw JSON, file, or individual properties from the input schema
  if (op.input) {
    y.option("json", { type: "string", describe: "JSON input (inline)" });
    y.option("file", { type: "string", alias: "f", describe: "JSON input from file" });
    // Also expose input schema properties as individual CLI options
    // Skip demandOption since input can also come from --json or --file
    if (ops.schemas[op.input]) {
      for (const [name, opt] of Object.entries(schemaToOptions(ops.schemas[op.input], true))) {
        y.option(name, opt);
      }
    }
  }

  return y;
}

/**
 * Extract parameters from parsed args based on the operation definition
 */
function extractParameters(args: Record<string, any>, op: OperationEntry, ops: OperationsFile): Record<string, any> {
  const params: Record<string, any> = {};
  const paramDef = op.parameters ? KNOWN_PARAMS[op.parameters] : undefined;

  if (paramDef?.positional && args[paramDef.positional] !== undefined) {
    params[paramDef.positional] = args[paramDef.positional];
  }
  if (paramDef?.options) {
    for (const name of Object.keys(paramDef.options)) {
      if (args[name] !== undefined) params[name] = args[name];
    }
  }
  // Custom schema parameters
  if (op.parameters && !paramDef && ops.schemas[op.parameters]?.properties) {
    for (const name of Object.keys(ops.schemas[op.parameters].properties)) {
      if (args[name] !== undefined) params[name] = args[name];
    }
  }

  return params;
}

/**
 * Extract input from parsed args
 */
function extractInput(args: Record<string, any>, op: OperationEntry, ops: OperationsFile): any | undefined {
  if (args.json) {
    return JSON.parse(args.json as string);
  }
  if (args.file) {
    return JSON.parse(readFileSync(args.file as string, "utf-8"));
  }
  // Build input from individual CLI options matching the input schema properties
  if (op.input && ops.schemas[op.input]?.properties) {
    const input: Record<string, any> = {};
    for (const name of Object.keys(ops.schemas[op.input].properties)) {
      if (args[name] !== undefined) input[name] = args[name];
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

  for (const [group, operations] of groups) {
    cli.command(group.toLowerCase(), `${group} operations`, groupY => {
      for (const op of operations) {
        const action = op.id.substring(op.id.indexOf(".") + 1).toLowerCase();
        const paramDef = op.parameters ? KNOWN_PARAMS[op.parameters] : undefined;

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
              input: op.input ? extractInput(args, op, ops!) : undefined
            });
          }
        );
      }
      return groupY.demandCommand(1, `Specify an action for ${group.toLowerCase()}`);
    });
  }

  return cli.completion("completion", false as any).demandCommand(1, "Specify a command").help();
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

  // Group commands by top-level name for subcommand support
  const topLevel = new Map<string, { name: string; info: import("../services/servicecommands.js").ServiceCommandInfo }[]>();

  for (const [cmdName, cmdInfo] of Object.entries(serviceCommands)) {
    const parts = cmdName.split(" ");
    const top = parts[0];
    if (!topLevel.has(top)) topLevel.set(top, []);
    topLevel.get(top)!.push({ name: cmdName, info: cmdInfo });
  }

  for (const [top, commands] of topLevel) {
    if (commands.length === 1 && commands[0].name === top) {
      // Simple command (no subcommands)
      const { name, info } = commands[0];
      cli.command(
        top,
        info.description,
        y => addCommandArgs(y, info.args),
        async args => handler(name, args as Record<string, any>)
      );
    } else {
      // Command group with subcommands
      cli.command(top, `${top} commands`, groupY => {
        for (const { name, info } of commands) {
          const sub = name.substring(top.length + 1) || top;
          groupY.command(
            sub,
            info.description,
            y => addCommandArgs(y, info.args),
            async args => handler(name, args as Record<string, any>)
          );
        }
        return groupY.demandCommand(1, `Specify a subcommand for ${top}`);
      });
    }
  }

  return cli;
}

/**
 * Add command argument definitions to a yargs builder.
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
  const ask = (question: string): Promise<string> =>
    new Promise(resolve => rl.question(question, resolve));

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
 * Ensure a service is available in the app configuration.
 * For beans that aren't registered as moddas, this loads them via sectionLoader.
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
          const importPath = join(resolve(app.getPath()), meta.Import);
          const [importFilename, importName = "default"] = importPath.split(":");
          const mod = await import(importFilename.endsWith(".js") ? importFilename : importFilename + ".js");
          const constructor = mod[importName];
          if (constructor) {
            app.getModdas()[fullName] = constructor;
            // Set up filterParameters and createConfiguration like sectionLoader does
            const { ServiceParameters: DefaultParams } = await import("../services/serviceparameters.js");
            let configClass = DefaultParams;
            if (meta.Configuration) {
              const configPath = join(resolve(app.getPath()), meta.Configuration);
              const [cfgFile, cfgName = "default"] = configPath.split(":");
              const cfgMod = await import(cfgFile.endsWith(".js") ? cfgFile : cfgFile + ".js");
              configClass = cfgMod[cfgName] || DefaultParams;
            }
            constructor.filterParameters = (params: any = {}) => {
              if (!meta.Schema?.properties) return params;
              const filtered: any = {};
              for (const field of Object.keys(meta.Schema.properties)) {
                if (params[field] !== undefined) filtered[field] = params[field];
              }
              return filtered;
            };
            constructor.createConfiguration = (params: any = {}) => {
              return new configClass().load(constructor.filterParameters(params));
            };
          }
        }
        return;
      }
    }
  }
}

/**
 * Default handler: prints the operation call as JSON
 */
async function defaultHandler(call: OperationCall): Promise<void> {
  console.log(JSON.stringify(call, undefined, 2));
}

/**
 * Load the Application from a path (packaged or unpacked)
 */
function loadApplication(appPath: string): Application {
  if (!existsSync(join(appPath, ".webda", "packaged.json"))) {
    return new UnpackedApplication(appPath);
  }
  return new Application(appPath);
}

// Main entry point when run directly
const isMain = isMainModule(import.meta);
if (isMain) {
  const appPath = resolve(process.env.WEBDA_APP_PATH || ".");
  await runWithInstanceStorage({}, async () => {
    // Ensure console output is available before anything else
    new ConsoleLogger(useWorkerOutput());
    try {
      const app = loadApplication(appPath);
      useInstanceStorage().application = app;
      await app.load();

      // Collect service commands from webda.module.json
      const serviceCommands = collectServiceCommands(app);

      // Track which command was matched so we know whether to boot Core
      let matchedCommand: { type: "operation"; call: OperationCall } | { type: "service"; name: string; args: Record<string, any> } | undefined;

      // Build the CLI with operations (if available) and service commands
      const rawArgv = process.argv.slice(2);
      const cli = yargs(rawArgv).scriptName("webda").usage("$0 <command> [options]");

      // Add service commands (serve, build, etc. from @Command decorators)
      addServiceCommandsToCli(cli, serviceCommands, async (cmdName, args) => {
        matchedCommand = { type: "service", name: cmdName, args };
      });

      // Add operation commands if operations.json exists
      const opsPath = join(resolve(appPath), ".webda", "operations.json");
      let ops: OperationsFile | undefined;
      if (existsSync(opsPath)) {
        ops = JSON.parse(readFileSync(opsPath, "utf-8"));
        const groups = groupOperations(ops.operations);
        for (const [group, operations] of groups) {
          cli.command(group.toLowerCase(), `${group} operations`, groupY => {
            for (const op of operations) {
              const action = op.id.substring(op.id.indexOf(".") + 1).toLowerCase();
              const paramDef = op.parameters ? KNOWN_PARAMS[op.parameters] : undefined;
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
                      input: op.input ? extractInput(args, op, ops!) : undefined
                    }
                  };
                }
              );
            }
            return groupY.demandCommand(1, `Specify an action for ${group.toLowerCase()}`);
          });
        }
      }

      cli.completion("completion", false as any).demandCommand(1, "Specify a command").help();

      await cli.parseAsync();

      if (!matchedCommand) {
        // No command matched, yargs already showed help or error
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
        process.on("SIGINT", async () => {
          await Promise.all([...CancelablePromise.promises].map(p => p.cancel()));
          await core.stop();
          process.exit(0);
        });
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
        const result = await service[methodName](...inputArgs);
        if (result !== undefined) {
          console.log(typeof result === "string" ? result : JSON.stringify(result, undefined, 2));
        }
        await core.stop();
        process.exit(0);
      } else {
        // Service command: boot Core and execute
        const cmdInfo = serviceCommands[matchedCommand.name];
        const serviceFilter = matchedCommand.args.service?.split(",");

        // Ensure services required by this command exist in the configuration
        // If no configured service provides this command, inject a default one
        const appConfig = app.getConfiguration();
        for (const svc of cmdInfo.services) {
          const hasProvider =
            Object.values(appConfig.services || {}).some(
              (cfg: any) => cfg.type === svc.type || cfg.type === svc.type.split("/").pop()
            ) || appConfig.services?.[svc.name];
          if (!hasProvider) {
            appConfig.services ??= {};
            appConfig.services[svc.name] = { type: svc.type };
          }
        }

        const core = new Core(app);
        process.on("SIGINT", async () => {
          await Promise.all([...CancelablePromise.promises].map(p => p.cancel()));
          await core.stop();
          process.exit(0);
        });
        await core.init();

        const exitCode = await executeServiceCommand(
          matchedCommand.name,
          cmdInfo,
          matchedCommand.args,
          core.getServices(),
          serviceFilter
        );
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });
}
