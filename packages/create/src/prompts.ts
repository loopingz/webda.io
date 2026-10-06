import * as clack from "@clack/prompts";
import { basename, resolve } from "node:path";
import {
  CreateOptions,
  detectPackageManager,
  OptionsError,
  ParsedArgs,
  Store,
  STORES,
  toNamespace,
  Transport,
  TRANSPORTS
} from "./options.js";

/**
 * Questions asked in interactive mode; abstracted for tests
 */
export interface Prompter {
  text(message: string, initial: string): Promise<string>;
  select<T extends string>(message: string, options: T[], initial: T): Promise<T>;
  multiselect<T extends string>(message: string, options: T[], initial: T[]): Promise<T[]>;
}

/**
 * Throw on Ctrl-C, otherwise return the answer
 * @param value - clack answer
 * @returns the answer
 */
function answer<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    throw new OptionsError("Cancelled");
  }
  return value as T;
}

export const clackPrompter: Prompter = {
  async text(message, initial) {
    return answer(await clack.text({ message, initialValue: initial })) as any;
  },
  async select(message, options, initial) {
    return answer(
      await clack.select({
        message,
        options: options.map(value => ({ value, label: value })) as any,
        initialValue: initial
      })
    ) as any;
  },
  async multiselect(message, options, initial) {
    return answer(
      await clack.multiselect({
        message,
        options: options.map(value => ({ value, label: value })) as any,
        initialValues: initial,
        required: false
      })
    ) as any;
  }
};

/**
 * Apply defaults and, in interactive mode, ask for missing values
 * @param args - parsed command line
 * @param context - interactivity, prompter, working directory and package manager user agent
 * @param context.interactive - whether running in interactive mode
 * @param context.prompter - prompter implementation for interactive input
 * @param context.cwd - current working directory
 * @param context.userAgent - package manager user agent
 * @returns complete options with an absolute `dir`
 */
export async function resolveOptions(
  args: ParsedArgs,
  context: { interactive: boolean; prompter: Prompter; cwd: string; userAgent?: string }
): Promise<CreateOptions> {
  const { interactive, prompter, cwd } = context;
  let dir = args.dir;
  if (dir === undefined) {
    if (!interactive) {
      throw new OptionsError("Missing project directory: npm create @webda <directory>");
    }
    dir = (await prompter.text("Project directory", "my-webda-app")).trim();
    if (!dir) throw new OptionsError("Missing project directory");
  }
  const store: Store = args.store ?? (interactive ? await prompter.select("Which store?", STORES, "memory") : "memory");
  const transports: Transport[] =
    args.transports ?? (interactive ? await prompter.multiselect("Which transports?", TRANSPORTS, ["rest"]) : ["rest"]);
  if (transports.length === 0) {
    throw new OptionsError(`Select at least one transport: ${TRANSPORTS.join(", ")}`);
  }
  const absolute = resolve(cwd, dir);
  return {
    dir: absolute,
    store,
    transports,
    namespace: args.namespace ?? toNamespace(basename(absolute)),
    pm: args.pm ?? detectPackageManager(context.userAgent),
    install: args.install,
    git: args.git,
    linkWorkspace: args.linkWorkspace
  };
}
