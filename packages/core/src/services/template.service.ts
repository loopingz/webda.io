import * as fs from "node:fs";
import * as path from "node:path";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { ServicePartialParameters } from "./iservice.js";
import { Counter } from "../metrics/metrics.js";
import { useLog } from "../loggers/hooks.js";
import { TemplateEngineNotFoundError, TemplateNotFoundError } from "../errors/errors.js";
import type { CompiledTemplate, TemplateEngine, TemplateRenderOptions } from "../templates/itemplate.js";
import { MustacheEngine } from "../templates/mustache.engine.js";
import { useApplication } from "../application/hooks.js";
import { useCore } from "../core/hooks.js";

/**
 * Configuration parameters for TemplateService
 */
export class TemplateServiceParameters extends ServiceParameters {
  /** Folders to search, in order, first match wins @default ["./templates"] */
  folders?: string[];
  /** Preferred engine when several extensions match @default "mustache" */
  engine?: string;
  /** Options passed to TemplateEngine.configure, by engine name */
  engines?: Record<string, any>;
  /** Cache compiled templates @default true */
  cache?: boolean;

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.folders ??= ["./templates"];
    this.engine ??= "mustache";
    this.cache ??= true;
    return this;
  }
}

/**
 * Pluggable template rendering service
 * @category CoreServices
 * @WebdaModda
 */
export class TemplateService<T extends TemplateServiceParameters = TemplateServiceParameters> extends Service<T> {
  private static engines: Map<string, TemplateEngine> = new Map();

  /** Cache of compiled templates */
  private cacheMap = new Map<string, { compiled: CompiledTemplate; engineName: string; part?: string }>();

  /**
   * Metrics for tracking template rendering and errors
   */
  declare metrics: {
    render: Counter;
    errors: Counter;
  };

  /**
   * Register a template engine
   *
   * @param name - Engine name (letters, digits, _, -, . only)
   * @param engine - Template engine implementation
   */
  static registerEngine(name: string, engine: TemplateEngine): void {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new Error(`Invalid engine name '${name}'`);
    }
    if (TemplateService.engines.has(name) && TemplateService.engines.get(name) !== engine) {
      useLog("WARN", `Template engine '${name}' already registered, replacing it`);
    }
    TemplateService.engines.set(name, engine);
  }

  /**
   * Get a registered template engine by name
   *
   * @param name - Engine name
   * @returns Template engine if found
   */
  static getEngine(name: string): TemplateEngine | undefined {
    return TemplateService.engines.get(name);
  }

  /**
   * @override
   */
  initMetrics() {
    super.initMetrics();
    this.metrics.render = this.getMetric(Counter, {
      name: "template_render",
      help: "Number of template renders",
      labelNames: ["engine"]
    });
    this.metrics.errors ??= this.getMetric(Counter, {
      name: "template_errors",
      help: "Number of template render errors"
    });
  }

  /**
   * @override
   */
  loadParameters(params: ServicePartialParameters<T>): T {
    return <T>new TemplateServiceParameters().load(params);
  }

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    if (this.parameters.engines) {
      for (const [name, opts] of Object.entries(this.parameters.engines)) {
        const engine = TemplateService.getEngine(name);
        if (engine?.configure) {
          engine.configure(opts);
        }
      }
    }
    return this;
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    for (const folder of this.parameters.folders ?? []) {
      const resolved = path.resolve(this.getBasePath(), folder);
      if (!fs.existsSync(resolved)) {
        this.log("WARN", "Template folder does not exist:", resolved);
      }
    }
    return this;
  }

  /**
   * Clear the template compilation cache
   */
  clearCache(): void {
    this.cacheMap.clear();
  }

  /**
   * Get the application base path
   *
   * @returns Base path for template resolution
   */
  protected getBasePath(): string {
    try {
      return useApplication()?.getPath() ?? process.cwd();
    } catch {
      return process.cwd();
    }
  }

  /**
   * Get the default locale configured in the application
   *
   * @returns Default locale string or undefined
   */
  protected getDefaultLocale(): string | undefined {
    try {
      return useCore()?.getLocales?.()?.[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Get all registered file extensions
   *
   * @returns List of registered extensions
   */
  protected getRegisteredExtensions(): string[] {
    const exts = new Set<string>();
    for (const engine of TemplateService.engines.values()) {
      for (const ext of engine.extensions) {
        exts.add(ext);
      }
    }
    return Array.from(exts);
  }

  /**
   * Find the matching engine for a file extension
   *
   * @param ext - File extension
   * @returns Matching engine and name or undefined
   */
  protected getEngineForExtension(ext: string): { name: string; engine: TemplateEngine } | undefined {
    const matches: { name: string; engine: TemplateEngine }[] = [];
    for (const [name, engine] of TemplateService.engines.entries()) {
      if (engine.extensions.includes(ext)) {
        matches.push({ name, engine });
      }
    }
    if (matches.length === 0) {
      return undefined;
    }
    if (matches.length === 1) {
      return matches[0];
    }
    const preferred = matches.find(m => m.name === this.parameters.engine);
    return preferred ?? matches[0];
  }

  /**
   * Load partials for a template file from its directory and partials subdirectories
   *
   * @param templateFilePath - Path to template file
   * @param folderPath - Root folder path
   * @returns Map of partial name to template content
   */
  protected loadPartials(templateFilePath: string, folderPath: string): Record<string, string> {
    const partials: Record<string, string> = {};
    const exts = this.getRegisteredExtensions();
    const templateDir = path.dirname(templateFilePath);

    const scanDir = (dir: string, prefix = "") => {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return;
      }
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            for (const ext of exts) {
              if (entry.name.endsWith("." + ext)) {
                const baseName = entry.name.slice(0, -(ext.length + 1));
                const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
                if (prefix) {
                  partials[`${prefix}${baseName}`] = content;
                }
                partials[baseName] = content;
                if (baseName.startsWith("_")) {
                  partials[baseName.substring(1)] = content;
                  if (prefix) {
                    partials[`${prefix}${baseName.substring(1)}`] = content;
                  }
                }
                break;
              }
            }
          }
        }
      } catch {
        // Ignore unreadable dirs
      }
    };

    // 1. Partials starting with _ in template directory
    scanDir(templateDir);

    // 2. If template is in a multi-part subfolder or locale subfolder, scan parent if within folderPath
    const parentDir = path.dirname(templateDir);
    if (parentDir.startsWith(folderPath) && parentDir !== templateDir) {
      scanDir(parentDir);
    }

    // 3. Scan partials/ subdirectory in template directory or folderPath
    scanDir(path.join(templateDir, "partials"), "partials/");
    if (folderPath !== templateDir) {
      scanDir(path.join(folderPath, "partials"), "partials/");
    }

    return partials;
  }

  /**
   * Get candidate locale search list
   *
   * @param requestedLocale - Requested locale e.g. "fr-FR"
   * @returns Candidate locale list in fallback order
   */
  protected getCandidateLocales(requestedLocale?: string): (string | undefined)[] {
    const locales: (string | undefined)[] = [];
    if (requestedLocale) {
      locales.push(requestedLocale);
      const lang = requestedLocale.split(/[-_]/)[0];
      if (lang && lang !== requestedLocale) {
        locales.push(lang);
      }
    }
    const defaultLocale = this.getDefaultLocale();
    if (defaultLocale && !locales.includes(defaultLocale)) {
      locales.push(defaultLocale);
    }
    locales.push(undefined);
    return locales;
  }

  /**
   * Resolve a template file candidate on disk
   *
   * @param name - Template name
   * @param locale - Optional locale
   * @returns Candidate match or undefined
   */
  protected resolveCandidate(
    name: string,
    locale?: string
  ):
    | {
        filePath: string;
        folderPath: string;
        engine: TemplateEngine;
        engineName: string;
        part?: string;
      }
    | undefined {
    const isMultiPart = name.includes("/");
    const [dirName, partName] = isMultiPart ? name.split("/") : [name, undefined];
    const exts = this.getRegisteredExtensions();
    const candidateLocales = this.getCandidateLocales(locale);

    for (const folder of this.parameters.folders ?? []) {
      const folderPath = path.resolve(this.getBasePath(), folder);
      if (!fs.existsSync(folderPath)) {
        continue;
      }

      for (const loc of candidateLocales) {
        for (const ext of exts) {
          // Extensions come from registered engines, so every extension has a match.
          const engineMatch = this.getEngineForExtension(ext)!;

          if (isMultiPart) {
            // Multi-part template paths
            const candidatePaths: string[] = [];
            if (loc) {
              candidatePaths.push(path.join(folderPath, dirName, loc, `${partName}.${ext}`));
              candidatePaths.push(path.join(folderPath, dirName, `${partName}.${loc}.${ext}`));
            } else {
              candidatePaths.push(path.join(folderPath, dirName, `${partName}.${ext}`));
            }

            for (const candidatePath of candidatePaths) {
              if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                return {
                  filePath: candidatePath,
                  folderPath,
                  engine: engineMatch.engine,
                  engineName: engineMatch.name,
                  part: partName
                };
              }
            }
          } else {
            // Single template paths
            const candidatePaths: string[] = [];
            if (loc) {
              candidatePaths.push(path.join(folderPath, `${name}.${loc}.${ext}`));
              candidatePaths.push(path.join(folderPath, loc, `${name}.${ext}`));
            } else {
              candidatePaths.push(path.join(folderPath, `${name}.${ext}`));
            }

            for (const candidatePath of candidatePaths) {
              if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                return {
                  filePath: candidatePath,
                  folderPath,
                  engine: engineMatch.engine,
                  engineName: engineMatch.name
                };
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Check if a template exists
   *
   * @param name - Template name (single, multi-part dir, or dir/part)
   * @param options - Locale options
   * @param options.locale - Locale string
   * @returns true if template exists
   */
  async has(name: string, options?: { locale?: string }): Promise<boolean> {
    return this.hasSync(name, options);
  }

  /**
   * Synchronous check if a template exists
   *
   * @param name - Template name
   * @param options - Locale options
   * @param options.locale - Locale string
   * @returns true if template exists
   */
  hasSync(name: string, options?: { locale?: string }): boolean {
    if (this.resolveCandidate(name, options?.locale)) {
      return true;
    }
    // If not found as a single file or dir/part, check if name is a multi-part directory
    if (!name.includes("/")) {
      const exts = this.getRegisteredExtensions();
      for (const folder of this.parameters.folders ?? []) {
        const folderPath = path.resolve(this.getBasePath(), folder);
        const dirPath = path.join(folderPath, name);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          try {
            const files = fs.readdirSync(dirPath);
            if (files.some(f => exts.some(ext => f.endsWith("." + ext)))) {
              return true;
            }
          } catch {
            // Ignore
          }
        }
      }
    }
    return false;
  }

  /**
   * List available template names across configured folders
   *
   * @returns List of available template names
   */
  async list(): Promise<string[]> {
    const names = new Set<string>();
    const exts = this.getRegisteredExtensions();

    for (const folder of this.parameters.folders ?? []) {
      const folderPath = path.resolve(this.getBasePath(), folder);
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        continue;
      }
      try {
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name === "partials") {
            continue;
          }
          if (entry.isDirectory()) {
            try {
              const subEntries = fs.readdirSync(path.join(folderPath, entry.name));
              const hasTpl = subEntries.some(f => exts.some(ext => f.endsWith("." + ext)));
              if (hasTpl) {
                names.add(entry.name);
              }
            } catch {
              // Ignore
            }
          } else if (entry.isFile()) {
            for (const ext of exts) {
              if (entry.name.endsWith("." + ext)) {
                let base = entry.name.slice(0, -(ext.length + 1));
                const dotIdx = base.indexOf(".");
                if (dotIdx > 0) {
                  base = base.substring(0, dotIdx);
                }
                names.add(base);
                break;
              }
            }
          }
        }
      } catch {
        // Ignore
      }
    }
    return Array.from(names).sort();
  }

  /**
   * Render an inline template string
   *
   * @param source - Template source string
   * @param data - Template variables
   * @param options - Render options including optional engine override
   * @returns Rendered template string
   */
  async renderString(
    source: string,
    data?: any,
    options?: TemplateRenderOptions & { engine?: string }
  ): Promise<string> {
    const engineName = options?.engine ?? this.parameters.engine ?? "mustache";
    const engine = TemplateService.getEngine(engineName);
    if (!engine) {
      this.metrics.errors.inc();
      throw new TemplateEngineNotFoundError(`Template engine '${engineName}' not found`);
    }

    try {
      const compiled = await engine.compile(source, options);
      const result = await compiled(data, options);
      this.metrics.render.inc({ engine: engineName });
      return result;
    } catch (err) {
      this.metrics.errors.inc();
      throw err;
    }
  }

  /**
   * Render a single template or a specific part of a multi-part template
   *
   * @param name - Template name ("welcome" or "PASSPORT_EMAIL_RECOVERY/html")
   * @param data - Data to pass to the template
   * @param options - Render options
   * @returns Rendered string
   */
  async render(name: string, data?: any, options?: TemplateRenderOptions): Promise<string> {
    const cacheKey = `${name}::${options?.locale ?? ""}`;
    const useCache = this.parameters.cache !== false;

    if (useCache && this.cacheMap.has(cacheKey)) {
      const cached = this.cacheMap.get(cacheKey)!;
      try {
        const result = await cached.compiled(data, options);
        this.metrics.render.inc({ engine: cached.engineName });
        return result;
      } catch (err) {
        this.metrics.errors.inc();
        throw err;
      }
    }

    const candidate = this.resolveCandidate(name, options?.locale);
    if (!candidate) {
      this.metrics.errors.inc();
      throw new TemplateNotFoundError(`Template '${name}' not found`);
    }

    const { filePath, folderPath, engine, engineName, part } = candidate;
    const autoPartials = this.loadPartials(filePath, folderPath);
    const mergedPartials = { ...autoPartials, ...options?.partials };

    const effectiveOptions: TemplateRenderOptions = {
      ...options,
      partials: mergedPartials
    };

    // For subject and text parts, disable HTML escaping unless explicitly configured
    if ((part === "subject" || part === "text") && effectiveOptions.escape === undefined) {
      effectiveOptions.escape = false;
    }

    try {
      let compiled: CompiledTemplate;
      if (engine.load) {
        compiled = await engine.load(filePath, effectiveOptions);
      } else {
        const source = fs.readFileSync(filePath, "utf-8");
        compiled = await engine.compile(source, effectiveOptions);
      }

      if (useCache) {
        this.cacheMap.set(cacheKey, { compiled, engineName, part });
      }

      const result = await compiled(data, effectiveOptions);
      this.metrics.render.inc({ engine: engineName });
      return result;
    } catch (err) {
      this.metrics.errors.inc();
      throw err;
    }
  }

  /**
   * Render all parts of a multi-part template
   *
   * @param name - Template name ("PASSPORT_EMAIL_RECOVERY")
   * @param data - Data to pass to template parts
   * @param options - Render options
   * @returns Object mapping part names to rendered strings
   */
  async renderAll(name: string, data?: any, options?: TemplateRenderOptions): Promise<Record<string, string>> {
    const exts = this.getRegisteredExtensions();
    const candidateLocales = this.getCandidateLocales(options?.locale);
    const parts = new Set<string>();
    let dirFound = false;

    for (const folder of this.parameters.folders ?? []) {
      const folderPath = path.resolve(this.getBasePath(), folder);
      const dirPath = path.join(folderPath, name);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        dirFound = true;
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
              for (const ext of exts) {
                if (entry.name.endsWith("." + ext)) {
                  let part = entry.name.slice(0, -(ext.length + 1));
                  const dotIdx = part.indexOf(".");
                  if (dotIdx > 0) {
                    part = part.substring(0, dotIdx);
                  }
                  parts.add(part);
                  break;
                }
              }
            } else if (entry.isDirectory() && candidateLocales.includes(entry.name)) {
              // Locale subdirectory
              const locEntries = fs.readdirSync(path.join(dirPath, entry.name), { withFileTypes: true });
              for (const locEntry of locEntries) {
                if (locEntry.isFile() && !locEntry.name.startsWith("_") && !locEntry.name.startsWith(".")) {
                  for (const ext of exts) {
                    if (locEntry.name.endsWith("." + ext)) {
                      const part = locEntry.name.slice(0, -(ext.length + 1));
                      parts.add(part);
                      break;
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!dirFound || parts.size === 0) {
      this.metrics.errors.inc();
      throw new TemplateNotFoundError(`Template '${name}' not found`);
    }

    const result: Record<string, string> = {};
    for (const part of parts) {
      result[part] = await this.render(`${name}/${part}`, data, options);
    }
    return result;
  }
}

// Register default mustache engine as a side effect
TemplateService.registerEngine("mustache", new MustacheEngine());
