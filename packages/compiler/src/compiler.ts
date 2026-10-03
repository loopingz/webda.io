import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, watch as watchFiles, type FSWatcher } from "node:fs";
import { FileUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import type { WebdaProject } from "./definition.js";
import { writeModule } from "./module.js";
import { build } from "./schema-backend.js";

/**
 * Compiler
 *
 * Builds an application on TypeScript 7.1 through `@webda/content-mapper`:
 * the two-pass build emits the JavaScript — generated accessors, behaviours
 * and WebdaQL rewrites included, type-checked as written — and the same
 * process generates `webda.module.json`. See `schema-backend.ts` for why it
 * runs out of process, and `docs/contribute/TypeScript 7 Content Mappers.md`
 * for the migration.
 */
export class Compiler {
  /**
   * If true the compiler has compiled already
   */
  compiled: boolean;
  /** File watcher when in watch mode. */
  private watcher?: FSWatcher;
  /** Pending rebuild in watch mode, debounced. */
  private rebuild?: NodeJS.Timeout;
  /**
   * True while rebuilding because `.webda/module.d.ts` changed
   */
  private secondPass = false;

  /**
   * Read the generated TypeScript library, if any
   * @param file - path to `.webda/module.d.ts`
   * @returns its content, or undefined when it does not exist
   */
  private readLibrary(file: string): string | undefined {
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  }

  /**
   * Create a new compiler for the given project
   * @param project - the Webda project to compile
   */
  constructor(public project: WebdaProject) {}

  /**
   * MD5 hex digest of a file's contents.
   * @param path - absolute path to the file
   * @returns the digest, or undefined if the file is missing
   */
  private fileDigest(path: string): string | undefined {
    if (!existsSync(path)) {
      return undefined;
    }
    return createHash("md5").update(readFileSync(path)).digest("hex");
  }

  /**
   * Add a system to recompile if needed
   * @returns true if compilation is needed
   */
  requireCompilation(): boolean {
    const f = this.project.getAppPath(".webda/cache");
    if (!existsSync(this.project.getAppPath(".webda"))) {
      mkdirSync(this.project.getAppPath(".webda"));
    }
    if (!existsSync(f)) {
      return true;
    }
    const webdaCache: {
      sourceDigest?: string;
      moduleDigest?: string;
    } = FileUtils.load(f, "json");
    const currentDigest = this.project.getDigest();
    if (webdaCache.sourceDigest !== currentDigest) {
      return true;
    }
    // Cross-check the on-disk webda.module.json: sources may be unchanged but
    // the generated module file can drift from the cache (git checkout, manual
    // edit, framework upgrade that regenerates it).
    const modulePath = this.project.getAppPath("webda.module.json");
    const moduleDigest = this.fileDigest(modulePath);
    if (!moduleDigest || moduleDigest !== webdaCache.moduleDigest) {
      return true;
    }
    // The module file must declare the same source digest it was generated
    // against, which catches replacement files carrying a cached content hash.
    let moduleContent: Record<string, any>;
    try {
      moduleContent = FileUtils.load(modulePath, "json");
      if (moduleContent.sourceDigest !== currentDigest) {
        return true;
      }
    } catch {
      return true;
    }
    // The output has to exist too. The digests only describe the inputs, so
    // without this a deleted `lib/` — or a single deleted file in it — was
    // reported as up to date.
    if (this.missingOutputs(moduleContent)) {
      return true;
    }
    useLog("DEBUG", "Skipping compilation as nothing changed");
    return false;
  }

  /**
   * Whether an emitted file the module points at is missing.
   *
   * Every `Import` in `webda.module.json` names an emitted file
   * (`lib/services/audit.model:AuditService`), so checking them follows the
   * configured `outDir` and catches a partially deleted output. A module that
   * declares nothing falls back to `lib/` existing.
   * @param mod - the parsed `webda.module.json`
   * @returns true if at least one output is missing
   */
  private missingOutputs(mod: Record<string, any>): boolean {
    const files = new Set<string>();
    for (const section of ["beans", "deployers", "moddas", "models", "behaviors"]) {
      for (const entry of Object.values<any>(mod[section] ?? {})) {
        if (typeof entry?.Import === "string") {
          files.add(entry.Import.split(":")[0]);
        }
      }
    }
    if (files.size === 0) {
      return !existsSync(this.project.getAppPath("lib"));
    }
    return [...files].some(file => !existsSync(this.project.getAppPath(`${file}.js`)));
  }

  /**
   * This is our main entry point
   * @param force - skip cache and force recompilation
   * @returns true if compilation succeeded
   */
  compile(force: boolean = false): boolean {
    if ((this.compiled || !this.requireCompilation()) && !force) {
      return true;
    }
    this.project.emit("compiling");
    const started = Date.now();
    const library = this.project.getAppPath(".webda/module.d.ts");
    const libraryBefore = this.readLibrary(library);

    let result;
    try {
      result = build(this.project.getAppPath(), {
        namespace: this.project.namespace,
        capabilities: this.project.packageDescription.webda?.capabilities
      });
    } catch (err) {
      useLog("ERROR", err.message);
      this.project.emit("compilationError");
      return false;
    }

    if (result.emit.diagnosticCount) {
      result.emit.diagnostics
        .split("\n")
        .filter(line => line.trim() !== "")
        .forEach(line => this.project.log("WARN", line));
      this.project.emit("compilationError");
      return false;
    }

    const compilation = Date.now() - started;
    const moduleStart = Date.now();
    this.project.emit("analyzing");
    // A module that cannot be written fails the build. Under TypeScript 6 the
    // error was logged and the build still reported success, so a strict
    // file-naming violation never actually stopped anything.
    if (!result.module || !writeModule(this, result.module)) {
      this.project.emit("compilationError");
      return false;
    }
    useLog("INFO", `Took: Compilation - ${compilation}ms | Module generation - ${Date.now() - moduleStart}ms`);
    // writeModule regenerates .webda/module.d.ts, which declares the configured
    // services and beans in ServicesMap. The schemas just written were derived
    // from the previous version, so when it changed (a clean checkout, a new
    // service) build once more against the new one.
    if (!this.secondPass && this.readLibrary(library) !== libraryBefore) {
      useLog("INFO", "Service map changed; rebuilding the module against it");
      this.secondPass = true;
      try {
        return this.compile(true);
      } finally {
        this.secondPass = false;
      }
    }
    this.compiled = true;
    this.updateCache();
    this.project.emit("done");
    return true;
  }

  /**
   * Persist the build cache: source digest plus the generated module file's
   * content hash, so {@link requireCompilation} can detect both source-file
   * changes and external mutations of webda.module.json.
   */
  private updateCache(): void {
    const f = this.project.getAppPath(".webda/cache");
    const webdaCache: {
      sourceDigest?: string;
      moduleDigest?: string;
    } = existsSync(f) ? FileUtils.load(f, "json") : {};
    webdaCache.sourceDigest = this.project.getDigest();
    webdaCache.moduleDigest = this.fileDigest(this.project.getAppPath("webda.module.json"));
    FileUtils.save(webdaCache, f, "json");
  }

  /**
   * Launch compiler in watch mode
   *
   * Rebuilds on any change under `src/`, debounced. The TypeScript 6 version
   * drove a `createWatchProgram`; there is no incremental emit with generated
   * code in 7.1's API, and a full two-pass build is fast enough — well under
   * a second for `@webda/core` — that a resident incremental program is not
   * worth its complexity yet.
   * @param callback - called with `MODULE_GENERATION` / `MODULE_GENERATED`
   *   around each rebuild, and with `COMPILATION_ERROR` when one fails
   */
  watch(callback: (event: string) => void = () => {}) {
    const run = () => {
      callback("MODULE_GENERATION");
      const ok = this.compile(true);
      callback(ok ? "MODULE_GENERATED" : "COMPILATION_ERROR");
    };
    this.watcher = watchFiles(this.project.getAppPath("src"), { recursive: true }, () => {
      clearTimeout(this.rebuild);
      this.rebuild = setTimeout(run, 150);
    });
    run();
  }

  /**
   * Stop watching for changes
   */
  stopWatch() {
    clearTimeout(this.rebuild);
    this.watcher?.close();
    this.watcher = undefined;
    this.compiled = false;
  }
}
