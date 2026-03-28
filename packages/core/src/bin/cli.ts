#!/usr/bin/env node
import yargs, { type Argv, type Options } from "yargs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { JSONSchema7 } from "json-schema";
import { isMainModule } from "@webda/tsc-esm";
import { Application } from "../application/application.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";

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
function schemaToOptions(schema: JSONSchema7): Record<string, Options> {
  if (schema.type !== "object" || !schema.properties) return {};
  const opts: Record<string, Options> = {};
  const required = new Set(schema.required || []);
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (typeof prop === "boolean") continue;
    const o: Options = { describe: prop.description || name, demandOption: required.has(name) };
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

  // Input: raw JSON or file
  if (op.input) {
    y.option("json", { type: "string", describe: "JSON input (inline)" });
    y.option("file", { type: "string", alias: "f", describe: "JSON input from file" });
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
function extractInput(args: Record<string, any>): any | undefined {
  if (args.json) {
    return JSON.parse(args.json as string);
  }
  if (args.file) {
    return JSON.parse(readFileSync(args.file as string, "utf-8"));
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
              input: op.input ? extractInput(args) : undefined
            });
          }
        );
      }
      return groupY.demandCommand(1, `Specify an action for ${group.toLowerCase()}`);
    });
  }

  return cli.demandCommand(1, "Specify a command").strict().help();
}

/**
 * Default handler: prints the operation call as JSON
 */
async function defaultHandler(call: OperationCall): Promise<void> {
  console.log(JSON.stringify(call, undefined, 2));
}

// Main entry point when run directly
const isMain = isMainModule(import.meta);
if (isMain) {
  const appPath = resolve(process.env.WEBDA_APP_PATH || ".");
  try {
    let app: Application;
    if (!existsSync(join(appPath, ".webda", "packaged.json"))) {
      // Not a packaged app, check if a recompile is needed
      app = new UnpackedApplication(appPath);
    } else {
      // Packaged app, load directly
      app = new Application(appPath);
    }
    const ops = loadOperations(appPath);
    const cli = buildCli(ops, defaultHandler);
    const parsed = await cli.parseAsync();
    // If no command matched, yargs shows help
    if (!parsed._?.length) {
      cli.showHelp();
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
