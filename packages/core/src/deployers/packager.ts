import { useLog } from "@webda/workout";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Application } from "../application/application.js";
import type { Configuration } from "../application/iconfiguration.js";
import * as WebdaError from "../errors/errors.js";
import { getGitInformation } from "./git.js";

/**
 * Path of the configuration within a packaged application
 */
export const PACKAGED_CONFIGURATION = "webda.config.json";
/**
 * Marker file of a packaged application: the CLI loads it from its cached configuration
 */
export const PACKAGED_MARKER = ".webda/packaged.json";

/**
 * Top-level entries of the application never packaged, `webda.config.*` and dot entries are always skipped
 */
const DEFAULT_IGNORES = [
  "node_modules",
  "dist",
  "bin",
  "test",
  "src",
  "coverage",
  "reports",
  "deployments",
  "app",
  "Dockerfile",
  "README.md"
];

/**
 * A file of the packaged application
 */
export interface PackageEntry {
  /**
   * Posix path of the file within the package
   */
  target: string;
  /**
   * Absolute path of the file to copy, symbolic links resolved
   */
  source?: string;
  /**
   * Content of a generated file, when there is no source
   */
  content?: string;
  /**
   * File mode of the source
   */
  mode?: number;
}

/**
 * Options of {@link packageApplication}
 */
export interface PackageOptions {
  /**
   * Additional top-level entries of the application to skip
   */
  ignores?: string[];
  /**
   * Regular expressions on the source path of the files to skip
   *
   * @default ["\\.d\\.ts$"]
   */
  excludePatterns?: string[];
  /**
   * Dependencies to add or remove from the application production dependencies
   */
  modules?: {
    includes?: string[];
    excludes?: string[];
  };
  /**
   * Services to remove from the packaged configuration, like the ones injected by the CLI to run a command
   */
  excludeServices?: string[];
}

/**
 * Options of {@link getDeployedConfiguration}
 */
export interface DeployedConfigurationOptions {
  /**
   * Services to remove from the configuration, in addition to the deployment units
   */
  excludeServices?: string[];
  /**
   * Rewrite the `Import` and `Configuration` paths of the cached modules, kept as is when omitted
   */
  rewriteImport?: (value: string) => string;
}

/**
 * A packaged application
 */
export interface ApplicationPackage {
  /**
   * Every file of the package, including the generated configuration and marker
   */
  files: PackageEntry[];
  /**
   * The packaged configuration, also in `files` as {@link PACKAGED_CONFIGURATION}
   */
  configuration: Configuration;
}

/**
 * A dependency placed in the package
 */
interface PlacedPackage {
  /**
   * Real path of the package folder
   */
  real: string;
  /**
   * Target folder within the package
   */
  target: string;
}

/**
 * Read a package.json
 * @param dir - the package folder
 * @returns the package description
 */
function readPackage(dir: string): any {
  return JSON.parse(readFileSync(join(dir, "package.json")).toString());
}

/**
 * Find a dependency folder like Node.js does, walking up the node_modules folders
 * @param name - the dependency name
 * @param from - real folder of the requiring package
 * @returns the real folder of the dependency or undefined
 */
function findDependency(name: string, from: string): string | undefined {
  let dir = from;
  while (true) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Add the files of a folder, following symbolic links and skipping nested node_modules
 * @param dir - the folder
 * @param target - its target within the package
 * @param entries - the entries to complete
 * @param accept - whether a file is included
 * @param visited - real folders already walked, to avoid cycles
 */
function addFolder(
  dir: string,
  target: string,
  entries: PackageEntry[],
  accept: (source: string) => boolean,
  visited: Set<string> = new Set()
) {
  const real = realpathSync(dir);
  if (visited.has(real)) {
    return;
  }
  visited.add(real);
  for (const name of readdirSync(real)) {
    if (name === "node_modules" || name === ".git") {
      continue;
    }
    addPath(join(real, name), target ? `${target}/${name}` : name, entries, accept, visited);
  }
}

/**
 * Add a file or folder
 * @param path - the path
 * @param target - its target within the package
 * @param entries - the entries to complete
 * @param accept - whether a file is included
 * @param visited - real folders already walked
 */
function addPath(
  path: string,
  target: string,
  entries: PackageEntry[],
  accept: (source: string) => boolean,
  visited: Set<string> = new Set()
) {
  if (!existsSync(path)) {
    // Broken symbolic link or missing `files` entry
    return;
  }
  const source = lstatSync(path).isSymbolicLink() ? realpathSync(path) : path;
  const stat = statSync(source);
  if (stat.isDirectory()) {
    addFolder(source, target, entries, accept, visited);
  } else if (stat.isFile() && accept(source)) {
    entries.push({ target, source, mode: stat.mode });
  }
}

/**
 * Add the files of a dependency: a published package entirely, a linked workspace package
 * only its package.json `files`
 * @param dir - real folder of the package
 * @param target - its target within the package
 * @param entries - the entries to complete
 * @param accept - whether a file is included
 */
function addPackageFiles(dir: string, target: string, entries: PackageEntry[], accept: (source: string) => boolean) {
  const files: string[] | undefined = readPackage(dir).files;
  if (dir.split(sep).includes("node_modules") || !files) {
    addFolder(dir, target, entries, accept);
    return;
  }
  addPath(join(dir, "package.json"), `${target}/package.json`, entries, accept);
  for (const file of files) {
    addPath(join(dir, file), `${target}/${file.replace(/^\.\//, "")}`, entries, accept);
  }
}

/**
 * Rewrite an `Import` (`path[:export]` relative to the application) to the packaged location
 * @param value - the import
 * @param appPath - the application path
 * @param realAppPath - its real path
 * @param placed - the packaged dependencies, longest real path first
 * @returns the packaged import
 */
function rewriteImport(value: string, appPath: string, realAppPath: string, placed: PlacedPackage[]): string {
  const [file, ...exportName] = value.split(":");
  const absolute = resolve(appPath, file);
  const parent = existsSync(dirname(absolute)) ? realpathSync(dirname(absolute)) : dirname(absolute);
  const real = join(parent, absolute.substring(dirname(absolute).length + 1));
  const suffix = exportName.length ? `:${exportName.join(":")}` : "";
  const dependency = placed.find(pkg => real.startsWith(pkg.real + sep));
  if (dependency) {
    return `${dependency.target}/${relative(dependency.real, real).split(sep).join("/")}${suffix}`;
  }
  if (real.startsWith(realAppPath + sep)) {
    return `${relative(realAppPath, real).split(sep).join("/")}${suffix}`;
  }
  useLog("WARN", `Cannot find '${value}' in the packaged application`);
  return value;
}

/**
 * Compute the configuration of the application with its current deployment applied
 *
 * It is a copy of the current configuration without the deployment units and the excluded services,
 * with the deployment name and the git information baked in the cached project.
 *
 * @param app - the loaded application
 * @param options - excluded services and import rewriting
 * @returns the deployed configuration
 */
export function getDeployedConfiguration(app: Application, options: DeployedConfigurationOptions = {}): Configuration {
  const configuration: Configuration = JSON.parse(JSON.stringify(app.getConfiguration()));
  for (const name of [
    ...(app.getDeployment()?.units ?? []).map(unit => unit.name),
    ...(options.excludeServices ?? [])
  ]) {
    delete configuration.services?.[name];
  }
  const modules: any = configuration.cachedModules ?? {};
  if (options.rewriteImport) {
    for (const section of ["moddas", "beans", "deployers", "models", "behaviors"]) {
      for (const definition of Object.values<any>(modules[section] ?? {})) {
        for (const key of ["Import", "Configuration"]) {
          if (typeof definition?.[key] === "string" && definition[key]) {
            definition[key] = options.rewriteImport(definition[key]);
          }
        }
      }
    }
  }
  if (modules.project) {
    const realAppPath = realpathSync(app.applicationPath);
    const description = readPackage(realAppPath);
    modules.project.deployment = { ...modules.project.deployment, name: app.getCurrentDeployment() ?? "" };
    modules.project.git = getGitInformation(realAppPath, description.name, description.version);
  }
  return configuration;
}

/**
 * Write a packaged application into a folder
 *
 * The folder is created if needed and must be empty: a previous package is never overwritten.
 *
 * @param pkg - the package from {@link packageApplication}
 * @param output - the target folder
 * @throws CodeError PACKAGE_OUTPUT_NOT_EMPTY if the folder already contains files
 */
export function writeApplicationPackage(pkg: ApplicationPackage, output: string): void {
  if (existsSync(output) && readdirSync(output).length) {
    throw new WebdaError.CodeError("PACKAGE_OUTPUT_NOT_EMPTY", `Package folder ${output} is not empty`);
  }
  for (const file of pkg.files) {
    const target = join(output, ...file.target.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    if (file.source) {
      copyFileSync(file.source, target);
    } else {
      writeFileSync(target, file.content ?? "");
    }
    // Only keep the executable bit, like the container layers
    chmodSync(target, (file.mode ?? 0o644) & 0o111 ? 0o755 : 0o644);
  }
}

/**
 * Compute the content of a deployable application: its files, its production dependencies and
 * its packaged configuration
 *
 * The application files are its package.json `files`, or its top-level entries minus the ignored ones.
 * Production dependencies (`dependencies`, `optionalDependencies` and resolvable `peerDependencies`) are
 * resolved like Node.js from the real path of each package, so pnpm, npm and workspace layouts work:
 * they are placed in `node_modules/<name>`, or nested under the requiring package on a version conflict.
 *
 * The configuration is the current configuration (with the deployment applied) without the deployment
 * units, its `cachedModules` imports rewritten to the packaged locations and the git information baked;
 * with the {@link PACKAGED_MARKER} file, the CLI loads it without scanning the modules.
 *
 * @param app - the loaded application
 * @param options - ignores, excludes and modules
 * @returns the files and configuration of the package
 */
export async function packageApplication(app: Application, options: PackageOptions = {}): Promise<ApplicationPackage> {
  const appPath = app.applicationPath;
  const realAppPath = realpathSync(appPath);
  const excludes = (options.excludePatterns ?? ["\\.d\\.ts$"]).map(pattern => new RegExp(pattern));
  const accept = (source: string) => !excludes.some(pattern => pattern.test(source));
  const files: PackageEntry[] = [];
  const description = readPackage(realAppPath);

  // Application files
  const ignores = [...DEFAULT_IGNORES, ...(options.ignores ?? [])];
  const entries: string[] = description.files ?? readdirSync(realAppPath);
  for (const entry of entries) {
    const name = entry.replace(/^\.\//, "");
    if (name.startsWith(".") || ignores.includes(name) || name.startsWith("webda.config.") || name === "package.json") {
      continue;
    }
    addPath(join(realAppPath, name), name, files, accept);
  }
  addPath(join(realAppPath, "package.json"), "package.json", files, accept);
  addPath(join(realAppPath, ".webda", "operations.json"), ".webda/operations.json", files, accept);

  // Production dependencies, breadth first so the application dependencies are placed at the top
  const placed: PlacedPackage[] = [];
  const topLevel = new Map<string, string>();
  const dependenciesOf = (pkg: any, root: boolean) => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...(root ? (options.modules?.includes ?? []) : [])
    ];
    const optional = new Set([
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {})
    ]);
    return [...new Set(names)]
      .filter(name => !root || !(options.modules?.excludes ?? []).includes(name))
      .map(name => ({ name, optional: optional.has(name) }));
  };
  const queue = dependenciesOf(description, true).map(dep => ({ ...dep, from: realAppPath, parent: "" }));
  while (queue.length) {
    const { name, optional, from, parent } = queue.shift();
    const real = findDependency(name, from);
    if (!real) {
      if (!optional) {
        useLog("WARN", `Cannot find package '${name}' required from ${from}`);
      }
      continue;
    }
    let target = `node_modules/${name}`;
    if (!topLevel.has(name)) {
      topLevel.set(name, real);
    } else if (topLevel.get(name) === real) {
      continue;
    } else {
      // Version conflict: nest under the requiring package
      target = `${parent}/node_modules/${name}`;
      if (placed.some(pkg => pkg.target === target)) {
        continue;
      }
    }
    placed.push({ real, target });
    addPackageFiles(real, target, files, accept);
    queue.push(...dependenciesOf(readPackage(real), false).map(dep => ({ ...dep, from: real, parent: target })));
  }

  // Packaged configuration
  const byLength = [...placed].sort((a, b) => b.real.length - a.real.length);
  const configuration = getDeployedConfiguration(app, {
    excludeServices: options.excludeServices,
    rewriteImport: value => rewriteImport(value, appPath, realAppPath, byLength)
  });
  const modules: any = configuration.cachedModules ?? {};
  files.push({ target: PACKAGED_CONFIGURATION, content: JSON.stringify(configuration, undefined, 2) });
  files.push({
    target: PACKAGED_MARKER,
    content: JSON.stringify(
      {
        deployment: app.getCurrentDeployment() ?? "",
        package: { name: description.name, version: description.version },
        git: modules.project?.git
      },
      undefined,
      2
    )
  });
  // A file listed twice (overlapping `files` entries) is packaged once
  const unique = [...new Map(files.map(file => [file.target, file])).values()];
  unique.sort((a, b) => a.target.localeCompare(b.target));
  return { files: unique, configuration };
}
