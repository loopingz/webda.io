import type { CommandArgDefinition, CommandDefinition, WebdaCliDescriptor } from "@webda/compiler";
import type { Application } from "../application/application.js";
import type { AbstractService } from "./iservice.js";
import { useLog } from "@webda/workout";

/**
 * A service command target: which service provides the command and how.
 */
export interface ServiceCommandTarget {
  /** Service type name from webda.module.json (e.g., "Webda/HttpServer") */
  name: string;
  /** Method name to call on the service */
  method: string;
  /** Service type identifier */
  type: string;
}

/**
 * Merged command info from one or more services declaring the same command.
 */
export interface ServiceCommandInfo {
  /** Human-readable description for CLI help */
  description: string;
  /** Services that handle this command (all execute in dependency order) */
  services: ServiceCommandTarget[];
  /** Merged argument definitions from all services */
  args: { [name: string]: CommandArgDefinition };
  /** Merged capability requirements from all services declaring this command */
  requires: string[];
  /**
   * Lifecycle phase declared by each service providing this command, in the
   * same order as `services`. Values are one of:
   * - `"application"`: service declared phase "application", a static method called without Core.
   * - `"resolved"`: service declared phase "resolved" (e.g. via `@BuildCommand`).
   * - `"initialized"`: service declared phase "initialized".
   * - `undefined`: service did not declare a phase (treat as "initialized").
   *
   * The CLI dispatcher uses this to decide whether to skip `Core.init()`:
   * all-"application" → no Core; all-"resolved" → resolve-only; all-"initialized"/undefined → full init;
   * mixed → error.
   */
  phases: Array<"application" | "resolved" | "initialized" | undefined>;
}

/**
 * Read the application command-line configuration, the `webda.cli` section of its package.json
 *
 * @param app - the loaded application
 * @returns the configuration, undefined when the package declares none
 */
export function getCliConfiguration(app: Pick<Application, "getPackageDescription">): WebdaCliDescriptor | undefined {
  return typeof app?.getPackageDescription === "function" ? app.getPackageDescription()?.webda?.cli : undefined;
}

/**
 * Whether a command is the given one or one of its subcommands
 *
 * @param cmdName - the command name, space-separated (`"config encrypt"`)
 * @param name - the command or command group (`"config"`)
 * @returns true if `cmdName` is `name` or under it
 */
function isCommandOrSubcommand(cmdName: string, name: string): boolean {
  return cmdName === name || cmdName.startsWith(`${name} `);
}

/**
 * A command the `webda.cli` selection applies to: a provider of a `@Command`, or an operation
 */
interface SelectableCommand {
  /** Command name, space-separated (`"config encrypt"`, `"task get"`) */
  cmdName: string;
  /** Service type providing the `@Command` */
  typeName?: string;
  /** An operation command, named in lowercase */
  operation?: boolean;
}

/**
 * The CLI command name of an operation: its group (the id before the first dot) and its action, in
 * lowercase, as `webda` declares it (`"Task.Get"` is `task get`)
 *
 * @param id - the operation id
 * @returns the command name
 */
export function operationCommandName(id: string): string {
  const dot = id.indexOf(".");
  const group = dot >= 0 ? id.substring(0, dot) : id;
  return `${group} ${id.substring(dot + 1)}`.toLowerCase();
}

/**
 * @param operationIds - operation ids
 * @returns the operations as selectable commands
 */
function operationCommands(operationIds: string[]): (SelectableCommand & { id: string; operation: true })[] {
  return operationIds.map(id => ({ cmdName: operationCommandName(id), id, operation: true }));
}

/**
 * Whether a `webda.cli.exclude` entry matches a command
 *
 * @param command - the command
 * @param type - the provider type of the entry (`"Webda/HttpServer"` in `"Webda/HttpServer:serve"`), if any
 * @param name - the command name of the entry
 * @returns true if the entry drops the command
 */
function excludes(command: SelectableCommand, type: string | undefined, name: string): boolean {
  if (command.operation) {
    // Operations have no provider type: only `"group"` or `"group action"`, in any case
    return type === undefined && isCommandOrSubcommand(command.cmdName, name.toLowerCase());
  }
  return (
    isCommandOrSubcommand(command.cmdName, name) &&
    (type === undefined ||
      command.typeName === type ||
      (!type.includes("/") && !!command.typeName?.endsWith(`/${type}`)))
  );
}

/**
 * Whether a `webda.cli.include` entry keeps a command
 *
 * @param command - the command
 * @param name - the entry
 * @returns true if the entry keeps the command
 */
function includes(command: SelectableCommand, name: string): boolean {
  return isCommandOrSubcommand(command.cmdName, command.operation ? name.toLowerCase() : name);
}

/**
 * Apply the `webda.cli` selection: `include` keeps the listed commands, then `exclude` removes some
 *
 * @param commands - the `@Command` providers and the operations
 * @param cli - the selection
 * @param warn - log a warning for an entry matching none of `commands`
 * @returns the commands selected
 */
function selectCommands<T extends SelectableCommand>(
  commands: T[],
  cli: Pick<WebdaCliDescriptor, "include" | "exclude"> | undefined,
  warn: boolean
): T[] {
  if (cli?.include) {
    for (const name of cli.include) {
      if (warn && !commands.some(c => includes(c, name))) {
        useLog("WARN", `webda.cli.include: no command '${name}'`);
      }
    }
    commands = commands.filter(c => cli.include.some(name => includes(c, name)));
  }
  for (const entry of cli?.exclude || []) {
    const separator = entry.indexOf(":");
    const type = separator >= 0 ? entry.substring(0, separator) : undefined;
    const name = separator >= 0 ? entry.substring(separator + 1) : entry;
    if (warn && !commands.some(c => excludes(c, type, name))) {
      useLog("WARN", `webda.cli.exclude: no ${type ? `provider '${type}' of command` : "command"} '${name}'`);
    }
    commands = commands.filter(c => !excludes(c, type, name));
  }
  return commands;
}

/**
 * Select the operations offered as CLI commands with the application `webda.cli` configuration
 *
 * An operation `Group.Action` is the command `group action`: `include` keeps it when it lists `"group"`
 * (every operation of the group) or `"group action"`, then `exclude` drops it the same way. Names are
 * matched in any case (`"RunnerAuth"` is `runnerauth`); the `"Type:command"` form only selects `@Command`
 * providers. Unmatched entries are reported by {@link collectServiceCommands}, which knows both sources.
 *
 * @param operationIds - the operation ids
 * @param cli - the command selection
 * @returns the operation ids selected
 */
export function selectOperations(
  operationIds: string[],
  cli: Pick<WebdaCliDescriptor, "include" | "exclude"> | undefined
): string[] {
  return selectCommands(operationCommands(operationIds), cli, false).map(c => c.id);
}

/**
 * Collect all CLI commands declared by services across all loaded modules.
 *
 * Scans the `moddas`, `beans`, and `deployers` sections of `webda.module.json`
 * for services that have `commands` metadata (generated by the `@Command` decorator
 * at compile time). Merges commands from multiple services that declare the same
 * command name — each service becomes an entry in the `services` array, and args
 * are merged (first definition wins for each arg name).
 *
 * The application `webda.cli` configuration (package.json) selects the commands first:
 * `include` keeps only the listed commands (with their subcommands), then `exclude`
 * removes a provider (`"Webda/HttpServer:serve"`) or a whole command (`"openapi"`, with
 * its subcommands). The selection applies to the operation commands too, see {@link selectOperations}:
 * an entry matching neither a command nor an operation is logged as a warning. Two remaining
 * providers declaring the same argument with another type or at another position are
 * logged as a warning too: every handler receives the same positional values.
 *
 * @param app - The loaded Webda Application with module metadata available
 * @param cli - The command selection, read from the application package.json by default
 * @param operationIds - The operation ids of the application (`.webda/operations.json`): an entry selecting
 *   only operations is not reported as matching nothing
 * @returns A map of command names to their merged definitions
 *
 * @example
 * ```typescript
 * const commands = collectServiceCommands(app);
 * // {
 * //   "serve": {
 * //     description: "Start the HTTP server",
 * //     services: [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }],
 * //     args: { port: { type: "number", default: 18080, alias: "p" } }
 * //   }
 * // }
 * ```
 */
export function collectServiceCommands(
  app: Application,
  cli: Pick<WebdaCliDescriptor, "include" | "exclude"> | undefined = getCliConfiguration(app),
  operationIds: string[] = []
): { [name: string]: ServiceCommandInfo } {
  const commands: { [name: string]: ServiceCommandInfo } = {};
  const modules = app.getModules();

  // Every provider of every command, in module order
  let providers: { cmdName: string; typeName: string; cmdDef: CommandDefinition; operation?: false }[] = [];
  for (const section of ["moddas", "beans", "deployers"] as const) {
    for (const [typeName, metadata] of Object.entries(modules[section] || {})) {
      if (!metadata.commands) continue;
      for (const [cmdName, cmdDef] of Object.entries(metadata.commands)) {
        providers.push({ cmdName, typeName, cmdDef });
      }
    }
  }

  // Select them, with the operation commands, with the application configuration
  providers = selectCommands([...providers, ...operationCommands(operationIds)], cli, true).filter(
    (p): p is (typeof providers)[number] => !p.operation
  );

  for (const { cmdName, typeName, cmdDef } of providers) {
    commands[cmdName] ??= {
      description: cmdDef.description,
      services: [],
      args: {},
      requires: [],
      phases: []
    };
    commands[cmdName].services.push({
      name: typeName,
      method: cmdDef.method,
      type: typeName
    });
    commands[cmdName].phases.push(cmdDef.phase);
    // Merge args from multiple services providing the same command
    for (const [argName, argDef] of Object.entries(cmdDef.args || {})) {
      commands[cmdName].args[argName] ??= argDef;
    }
    // Merge requires (union, no duplicates)
    for (const req of cmdDef.requires || []) {
      if (!commands[cmdName].requires.includes(req)) {
        commands[cmdName].requires.push(req);
      }
    }
  }

  // Every handler is called with the merged arguments as positional parameters: report the
  // providers whose own parameters would receive another argument's value
  for (const { cmdName, typeName, cmdDef } of providers) {
    const merged = commands[cmdName].args;
    const positions = Object.keys(merged);
    Object.entries(cmdDef.args || {}).forEach(([argName, argDef], position) => {
      if (positions[position] !== argName) {
        useLog(
          "WARN",
          `Command '${cmdName}': parameter '${argName}' of ${typeName} is at position ${position} but receives ` +
            `'${positions[position]}' (merged arguments: ${positions.join(", ")}); ` +
            `align the parameters or drop a provider with webda.cli.exclude ("<Type>:${cmdName}")`
        );
      } else if (merged[argName].type !== argDef.type) {
        useLog(
          "WARN",
          `Command '${cmdName}': parameter '${argName}' of ${typeName} is ${argDef.type} but parsed as ` +
            `${merged[argName].type}; align the parameters or drop a provider with webda.cli.exclude ("<Type>:${cmdName}")`
        );
      }
    });
  }

  return commands;
}

/**
 * @param service - a service instance
 * @returns the names of its class and of every ancestor class
 */
function classChainNames(service: any): string[] {
  const names: string[] = [];
  for (let clazz = service?.constructor; clazz && clazz !== Function.prototype; clazz = Object.getPrototypeOf(clazz)) {
    if (clazz.name) names.push(clazz.name);
  }
  return names;
}

/**
 * Execute a CLI command by dispatching to all services that declared it.
 *
 * Services are executed in the order they were initialized (which follows the
 * dependency graph). The `serviceFilter` filters to specific services by name
 * (supports suffix matching).
 *
 * Each service's command handler is called with the parsed arguments as
 * positional parameters. A handler returning a number sets the exit code: the
 * highest one wins, any other result counts as `0`.
 *
 * @param cmdName - The command name to execute (e.g., `"serve"`, `"migrate"`)
 * @param cmdInfo - The merged command definition from {@link collectServiceCommands}
 * @param args - Parsed argument values keyed by argument name
 * @param services - Map of service name to service instance (from Core.getServices())
 * @param serviceFilter - Optional list of service names to filter to (supports suffix matching)
 * @returns the highest exit code returned by the handlers (`0` on success), `1` if no services match the filter,
 *   a method is missing or no service instance ran
 *
 * @example
 * ```typescript
 * // Execute "migrate" on all services:
 * await executeServiceCommand("migrate", cmdInfo, { dryRun: true }, core.getServices());
 *
 * // Execute "migrate" on a specific service:
 * await executeServiceCommand("migrate", cmdInfo, { dryRun: true }, core.getServices(), ["PostgresMigrator"]);
 * ```
 */
export async function executeServiceCommand(
  cmdName: string,
  cmdInfo: ServiceCommandInfo,
  args: { [key: string]: any },
  services: { [key: string]: AbstractService },
  serviceFilter?: string[]
): Promise<number> {
  // Filter services if requested, by type (e.g. "HttpServer") or by instance name (e.g. a deployment unit)
  const filtered = serviceFilter && serviceFilter.length > 0;
  const typeMatches = (svc: ServiceCommandTarget) =>
    !filtered || serviceFilter.some(f => svc.name.endsWith(f) || svc.name === f);
  const instanceMatches = (service: AbstractService) =>
    filtered && typeof service.getName === "function" && serviceFilter.includes(service.getName());

  // Build positional args from command arg definitions; an omitted argument keeps
  // its slot as undefined so the following ones stay in position
  const commandArgs: any[] = Object.keys(cmdInfo.args).map(argName =>
    args[argName] !== undefined ? args[argName] : cmdInfo.args[argName].default
  );

  // Count executed handlers: a command where every provider was skipped did nothing
  let executed = 0;
  // Highest exit code returned by a handler
  let exitCode = 0;
  const recordExitCode = (result: any) => {
    if (typeof result === "number" && result > exitCode) {
      exitCode = result;
    }
  };
  // Long-running handlers (serve, worker) return a cancelable promise that stays
  // pending while they run: start them all, then wait for every one to settle.
  const running: PromiseLike<any>[] = [];
  // Execute each matching service handler. A single target type can map to
  // multiple configured instances (e.g. two HttpServer services on different
  // ports); dispatch to every instance whose constructor matches the type.
  let filterMatched = !filtered;
  for (const svc of cmdInfo.services) {
    let matches: AbstractService[] = [];
    // Direct lookup — works when the modda name is used verbatim as service key
    if (services[svc.name]) matches.push(services[svc.name]);
    // Plus every other configured instance of the same class
    const shortName = svc.type.split("/").pop();
    for (const [, instanceService] of Object.entries(services)) {
      if (!instanceService || matches.includes(instanceService)) continue;
      // A subclass inherits the command (e.g. an application `Authentication` running `auth migrate`)
      if (classChainNames(instanceService).includes(shortName)) {
        matches.push(instanceService);
      }
    }
    if (!typeMatches(svc)) {
      matches = matches.filter(instanceMatches);
      if (matches.length === 0) continue;
    }
    filterMatched = true;
    if (matches.length === 0) {
      useLog("WARN", `Service '${svc.name}' not found, skipping`);
      continue;
    }
    for (const service of matches) {
      // A subclass can redeclare an inherited command. Select its closest declaration once, regardless of
      // the order in which the module loader supplied the parent and child providers.
      const chain = classChainNames(service);
      const distance = chain.indexOf(shortName);
      if (
        distance >= 0 &&
        cmdInfo.services.some(provider => {
          if (!typeMatches(provider) && !instanceMatches(service)) return false;
          const candidate = chain.indexOf(provider.type.split("/").pop());
          return candidate >= 0 && candidate < distance;
        })
      )
        continue;
      if (!service[svc.method]) {
        const instanceName = typeof service.getName === "function" ? service.getName() : svc.name;
        useLog("ERROR", `Method '${svc.method}' not found on service '${instanceName}'`);
        return 1;
      }
      const result = service[svc.method](...commandArgs);
      if (isCancelable(result)) {
        running.push(result);
      } else {
        recordExitCode(await result);
      }
      executed++;
    }
  }

  if (!filterMatched) {
    useLog("ERROR", `No services match filter '${serviceFilter.join(",")}' for command '${cmdName}'`);
    return 1;
  }
  if (executed === 0) {
    useLog("ERROR", `No service instance found to run command '${cmdName}'`);
    return 1;
  }
  // Cancelling a long-running command (SIGINT, SIGTERM) is a clean stop
  await Promise.all(
    running.map(p =>
      Promise.resolve(p).then(recordExitCode, err => {
        if (err !== "Cancelled") {
          throw err;
        }
      })
    )
  );
  return exitCode;
}

/**
 * Whether a command handler returned a long-running cancelable promise
 * (CancelablePromise or CancelableLoopPromise)
 *
 * @param result - the handler result
 * @returns true if the result can be cancelled
 */
function isCancelable(result: any): result is PromiseLike<any> & { cancel: () => Promise<void> } {
  return typeof result?.then === "function" && typeof result?.cancel === "function";
}
