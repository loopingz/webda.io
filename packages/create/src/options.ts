import { parseArgs } from "node:util";

export type Store = "memory" | "file" | "mongodb" | "postgres";
export const STORES: Store[] = ["memory", "file", "mongodb", "postgres"];
export type Transport = "rest" | "graphql" | "grpc" | "mcp";
export const TRANSPORTS: Transport[] = ["rest", "graphql", "grpc", "mcp"];
export type PackageManager = "pnpm" | "npm" | "yarn";
export const PACKAGE_MANAGERS: PackageManager[] = ["pnpm", "npm", "yarn"];

/**
 * Fully resolved options used to generate an application
 */
export interface CreateOptions {
  dir: string;
  store: Store;
  transports: Transport[];
  namespace: string;
  pm: PackageManager;
  install: boolean;
  git: boolean;
  linkWorkspace?: string;
}

/**
 * Command line arguments, before defaults and prompts
 */
export interface ParsedArgs {
  dir?: string;
  store?: Store;
  transports?: Transport[];
  namespace?: string;
  pm?: PackageManager;
  install: boolean;
  git: boolean;
  yes: boolean;
  help: boolean;
  linkWorkspace?: string;
}

/**
 * Invalid or missing user input; the CLI prints the message and exits 1
 */
export class OptionsError extends Error {}

/**
 * Check `value` is one of `allowed`
 * @param flag - flag name used in the error message
 * @param value - user value
 * @param allowed - valid values
 * @returns the value, typed
 */
function oneOf<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw new OptionsError(`Invalid --${flag} "${value}". Valid values: ${allowed.join(", ")}`);
  }
  return value as T;
}

/**
 * Parse a comma separated transport list, trimming and removing duplicates
 * @param value - raw `--transports` value
 * @returns at least one valid transport
 */
function parseTransports(value: string): Transport[] {
  const list = [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
  if (list.length === 0) {
    throw new OptionsError(`--transports needs at least one of: ${TRANSPORTS.join(", ")}`);
  }
  return list.map(item => oneOf("transports", item, TRANSPORTS));
}

/**
 * Parse command line arguments
 * @param argv - arguments without the node binary and script path
 * @returns parsed arguments; values not given are undefined
 */
export function parseCliArgs(argv: string[]): ParsedArgs {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        store: { type: "string" },
        transports: { type: "string" },
        namespace: { type: "string" },
        pm: { type: "string" },
        "no-install": { type: "boolean" },
        "no-git": { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
        "link-workspace": { type: "string" }
      }
    });
  } catch (err) {
    throw new OptionsError((err as Error).message);
  }
  const values = parsed.values as Record<string, string | boolean | undefined>;
  if (parsed.positionals.length > 1) {
    throw new OptionsError(`Expected one directory, got: ${parsed.positionals.join(" ")}`);
  }
  const namespace = values.namespace as string | undefined;
  if (namespace !== undefined && !/^[A-Z][A-Za-z0-9]*$/.test(namespace)) {
    throw new OptionsError(`Invalid --namespace "${namespace}": use PascalCase letters and digits, e.g. MyApp`);
  }
  const result: ParsedArgs = {
    dir: parsed.positionals[0],
    store: values.store === undefined ? undefined : oneOf("store", values.store as string, STORES),
    transports: values.transports === undefined ? undefined : parseTransports(values.transports as string),
    namespace,
    pm: values.pm === undefined ? undefined : oneOf("pm", values.pm as string, PACKAGE_MANAGERS),
    install: !values["no-install"],
    git: !values["no-git"],
    yes: Boolean(values.yes),
    help: Boolean(values.help),
    linkWorkspace: values["link-workspace"] as string | undefined
  };
  return result;
}

/**
 * Derive a PascalCase namespace from a directory name
 * @param name - directory basename
 * @returns a namespace matching /^[A-Z][A-Za-z0-9]*$/
 */
export function toNamespace(name: string): string {
  const pascal = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Z]/.test(pascal) ? pascal : `App${pascal}`;
}

/**
 * Derive a valid npm package name from a directory name
 * @param name - directory basename
 * @returns lowercase name using only a-z, 0-9, `-`, `_` and `.`
 */
export function toPackageName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "webda-app";
}

/**
 * Detect which package manager launched the command
 * @param userAgent - `npm_config_user_agent`
 * @returns the package manager, `npm` when unknown
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split("/")[0];
  return PACKAGE_MANAGERS.includes(name as PackageManager) ? (name as PackageManager) : "npm";
}
