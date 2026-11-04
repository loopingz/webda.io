import { readdir, readFile, stat } from "fs/promises";
import { dirname, join, resolve, sep } from "path";
import type { CompiledTemplate, TemplateRenderOptions } from "./itemplate.js";
import { getEngineForExtension, getTemplateEngine, listTemplateEngines } from "./engines.js";
import { TemplateEngineNotFoundError, TemplateNotFoundError } from "./errors.js";

/**
 * Options of the TemplateRenderer
 */
export interface TemplateRendererOptions {
  /**
   * Folders to look templates into, in priority order (resolved against process.cwd())
   */
  folders: string[];
  /**
   * Engine winning when several handle the same extension
   * @default "mustache"
   */
  engine?: string;
  /**
   * Cache compiled templates
   * @default true
   */
  cache?: boolean;
  /**
   * Default locale added to the fallback candidates
   */
  defaultLocale?: () => string | undefined;
}

/**
 * A located template file
 */
interface Located {
  path: string;
  engine: string;
  folder: string;
  /**
   * Folder of the multi-part template, for a part
   */
  templateDir?: string;
  /**
   * Requested part, for a file matched as a multi-part one
   */
  part?: string;
}

const LOCALE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Check a path exists as a regular file
 * @param path - the path
 * @returns true if it is a file
 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * List a directory, empty if it does not exist
 * @param path - the directory
 * @returns the entries
 */
async function readDir(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Renders templates found in folders, with locale fallback, partials and cache
 */
export class TemplateRenderer {
  protected folders: string[];
  protected cache = new Map<string, Promise<CompiledTemplate>>();

  /**
   * @param options - the renderer options
   */
  constructor(protected options: TemplateRendererOptions) {
    this.folders = options.folders.map(f => resolve(process.cwd(), f));
  }

  /**
   * Split a template reference and validate it
   * @param name - `NAME` or `NAME/part`
   * @returns the name and part
   */
  protected parse(name: string): { name: string; part?: string } {
    if (!name || name.includes("..") || name.startsWith("/") || name.includes("\\") || name.includes("\0")) {
      throw new TemplateNotFoundError(name);
    }
    const idx = name.lastIndexOf("/");
    return idx < 0 ? { name } : { name: name.substring(0, idx), part: name.substring(idx + 1) };
  }

  /**
   * Locale candidates, most specific first
   *
   * A locale not matching `[A-Za-z0-9_-]+` is ignored, as if no locale was requested
   * @param locale - requested locale
   * @returns deduped candidates, `undefined` standing for no locale
   */
  protected candidates(locale?: string): (string | undefined)[] {
    const list = [locale, locale?.split("-")[0], this.options.defaultLocale?.()].filter(
      l => !!l && LOCALE_PATTERN.test(l)
    );
    return [...new Set(list), undefined];
  }

  /**
   * Registered extensions, the preferred engine ones first
   * @returns extensions
   */
  protected extensions(): string[] {
    const names = listTemplateEngines();
    const preferred = this.options.engine ?? "mustache";
    names.sort((a, b) => Number(b === preferred) - Number(a === preferred));
    return [...new Set(names.flatMap(n => getTemplateEngine(n)!.extensions))];
  }

  /**
   * Registered extensions handled by a multi-part engine (one defining `parts`)
   * @returns extensions
   */
  protected multiExtensions(): string[] {
    return this.extensions().filter(
      ext => !!getEngineForExtension(ext, this.options.engine ?? "mustache")?.engine.parts
    );
  }

  /**
   * Candidate paths of a multi-part file: `NAME/[cand/]email.<ext>` then `NAME[.cand].<ext>`
   * @param folder - the templates folder
   * @param name - the template name
   * @param candidate - the locale candidate
   * @returns the paths, one pair per multi-part extension
   */
  private multiPartFiles(folder: string, name: string, candidate: string | undefined): string[] {
    return this.multiExtensions().flatMap(ext => [
      join(folder, name, ...(candidate ? [candidate] : []), `email.${ext}`),
      join(folder, `${name}${candidate ? "." + candidate : ""}.${ext}`)
    ]);
  }

  /**
   * Check a name is a file next to the `email.<ext>` of a multi-part template folder
   * @param folder - the templates folder
   * @param name - the template name
   * @returns true if the name is such a sibling
   */
  private async isSibling(folder: string, name: string): Promise<boolean> {
    const parent = dirname(join(folder, name));
    for (const ext of this.multiExtensions()) {
      if (await isFile(join(parent, `email.${ext}`))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check a path stays inside its folder
   * @param folder - the folder
   * @param path - the candidate path
   * @returns true if contained
   */
  protected contained(folder: string, path: string): boolean {
    return resolve(path).startsWith(folder + sep);
  }

  /**
   * Locate the file of a template (source access, to override for another source)
   * @param name - the template name
   * @param part - the part for multi-part templates
   * @param locale - requested locale
   * @returns the path and engine name, or undefined
   */
  protected async read(
    name: string,
    part: string | undefined,
    locale: string | undefined
  ): Promise<{ path: string; engine: string } | undefined> {
    const found = await this.locate(name, part, locale);
    return found ? { path: found.path, engine: found.engine } : undefined;
  }

  /**
   * Walk folders, locales and extensions to find the file
   * @param name - the template name
   * @param part - the part for multi-part templates
   * @param locale - requested locale
   * @returns the located file, or undefined
   */
  private async locate(
    name: string,
    part: string | undefined,
    locale: string | undefined
  ): Promise<Located | undefined> {
    const preferred = this.options.engine ?? "mustache";
    const exts = this.extensions();
    const multi = this.multiExtensions();
    for (const folder of this.folders) {
      for (const candidate of this.candidates(locale)) {
        for (const ext of part !== undefined ? exts.filter(e => !multi.includes(e)) : exts) {
          const path =
            part !== undefined
              ? join(folder, name, ...(candidate ? [candidate] : []), `${part}.${ext}`)
              : join(folder, `${name}${candidate ? "." + candidate : ""}.${ext}`);
          if (this.contained(folder, path) && (await isFile(path))) {
            // The extensions come from the registered engines, one always handles it
            const engine = getEngineForExtension(ext, preferred)!;
            // A multi-part file without any part (a helper module) is not a template
            if (multi.includes(ext) && (await engine.engine.parts!(path)).length === 0) {
              continue;
            }
            return {
              path,
              engine: engine.name,
              folder,
              templateDir: part !== undefined ? join(folder, name) : undefined,
              part
            };
          }
        }
        if (part === undefined) {
          continue;
        }
        for (const path of this.multiPartFiles(folder, name, candidate)) {
          const engine = getEngineForExtension(path.substring(path.lastIndexOf(".") + 1), preferred)!;
          if (
            this.contained(folder, path) &&
            (await isFile(path)) &&
            (await engine.engine.parts!(path)).includes(part)
          ) {
            return { path, engine: engine.name, folder, part };
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Collect the partials around a matched file
   *
   * Sources, the later winning on a name clash: the folder `partials` directory, the multi-part
   * template folder `_` files, then the matched file directory `_` files (the locale subfolder of a part)
   * @param located - the matched file
   * @returns partial sources by name
   */
  private async partials(located: Located): Promise<{ [name: string]: string }> {
    const partials: { [name: string]: string } = {};
    const exts = this.extensions();
    const dirs: [string, boolean][] = [[join(located.folder, "partials"), false]];
    if (located.templateDir && located.templateDir !== dirname(located.path)) {
      dirs.push([located.templateDir, true]);
    }
    dirs.push([dirname(located.path), true]);
    for (const [dir, underscore] of dirs) {
      for (const entry of await readDir(dir)) {
        if (!entry.isFile() || (underscore && !entry.name.startsWith("_"))) {
          continue;
        }
        const ext = exts.find(e => entry.name.endsWith("." + e));
        if (!ext) {
          continue;
        }
        let pname = entry.name.substring(0, entry.name.length - ext.length - 1);
        if (underscore) {
          pname = pname.substring(1);
        }
        partials[pname] = await readFile(join(dir, entry.name), "utf8");
      }
    }
    return partials;
  }

  /**
   * Load and compile a located template
   * @param located - the matched file
   * @param options - compile options
   * @returns the compiled template
   */
  private async compile(located: Located, options: TemplateRenderOptions): Promise<CompiledTemplate> {
    const engine = getTemplateEngine(located.engine)!;
    if (engine.parts) {
      return engine.load!(located.path, { ...options, part: located.part });
    }
    const partials = await this.partials(located);
    if (engine.load) {
      return engine.load(located.path, { partials, ...options });
    }
    return engine.compile(await readFile(located.path, "utf8"), { partials, ...options });
  }

  /**
   * Check a template exists: a single template, a part, or a multi-part template folder with at least one part
   *
   * A nested name like `auth/WELCOME` is a multi-part template when the `auth/WELCOME` folder has parts
   * @param name - `NAME` or `NAME/part`
   * @param options - lookup options
   * @param options.locale - locale to look for
   * @returns true if found
   */
  async has(name: string, options?: { locale?: string }): Promise<boolean> {
    try {
      const parsed = this.parse(name);
      if (await this.read(parsed.name, parsed.part, options?.locale)) {
        return true;
      }
      // The whole name can also be a multi-part template folder
      return (await this.parts(name, options?.locale)) !== undefined;
    } catch (err) {
      if (err instanceof TemplateNotFoundError) {
        return false;
      }
      throw err;
    }
  }

  /**
   * List the template names: single templates and multi-part folders
   * @returns sorted names
   */
  async list(): Promise<string[]> {
    const exts = this.extensions();
    const names = new Set<string>();
    for (const folder of this.folders) {
      for (const entry of await readDir(folder)) {
        if (entry.name.startsWith("_") || entry.name === "partials") {
          continue;
        }
        if (entry.isDirectory()) {
          names.add(entry.name);
          continue;
        }
        const ext = exts.find(e => entry.name.endsWith("." + e));
        if (!ext) {
          continue;
        }
        let base = entry.name.substring(0, entry.name.length - ext.length - 1);
        const dot = base.lastIndexOf(".");
        if (dot > 0 && LOCALE_PATTERN.test(base.substring(dot + 1))) {
          base = base.substring(0, dot);
        }
        names.add(base);
      }
    }
    return [...names].sort();
  }

  /**
   * Get the compiled template, from cache if enabled
   * @param name - the template name
   * @param part - the part for multi-part templates
   * @param locale - requested locale
   * @param options - compile options
   * @returns the compiled template
   */
  private async compiled(
    name: string,
    part: string | undefined,
    locale: string | undefined,
    options: TemplateRenderOptions
  ) {
    const key = `${name}|${part}|${locale}`;
    const useCache = this.options.cache !== false;
    if (useCache && this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const located = await this.locate(name, part, locale);
    if (!located) {
      throw new TemplateNotFoundError(part ? `${name}/${part}` : name);
    }
    const promise = this.compile(located, options);
    if (useCache) {
      this.cache.set(key, promise);
      promise.catch(() => this.cache.delete(key));
    }
    return promise;
  }

  /**
   * Render a template
   * @param name - `NAME` or `NAME/part`
   * @param data - the data
   * @param options - render options, `locale` selects the language
   * @returns the rendered string
   */
  async render(name: string, data: any = {}, options: TemplateRenderOptions = {}): Promise<string> {
    const parsed = this.parse(name);
    const compiled = await this.compiled(parsed.name, parsed.part, options.locale, options);
    return compiled(data, options);
  }

  /**
   * Render every part of a multi-part template
   * @param name - the multi-part template name, the whole name being its folder (`WELCOME`, `auth/WELCOME`)
   * @param data - the data
   * @param options - render options
   * @returns the rendered parts keyed by part name
   */
  async renderAll(name: string, data: any = {}, options: TemplateRenderOptions = {}): Promise<Record<string, string>> {
    this.parse(name);
    const parts = await this.parts(name, options.locale);
    if (!parts) {
      throw new TemplateNotFoundError(name);
    }
    const result: Record<string, string> = {};
    for (const p of parts) {
      result[p] = await this.render(`${name}/${p}`, data, options);
    }
    return result;
  }

  /**
   * List the parts of a multi-part template, from the first folder having at least one
   * @param name - the multi-part template name
   * @param locale - requested locale
   * @returns the sorted part names, or undefined if no folder has a part
   */
  protected async parts(name: string, locale?: string): Promise<string[] | undefined> {
    const exts = this.extensions();
    for (const folder of this.folders) {
      const dir = join(folder, name);
      if (!this.contained(folder, dir)) {
        continue;
      }
      const parts = new Set<string>();
      const multi = this.multiExtensions();
      for (const candidate of this.candidates(locale)) {
        for (const entry of await readDir(candidate ? join(dir, candidate) : dir)) {
          const ext = exts.find(e => entry.name.endsWith("." + e));
          if (entry.isFile() && ext && !multi.includes(ext) && !entry.name.startsWith("_")) {
            parts.add(entry.name.substring(0, entry.name.length - ext.length - 1));
          }
        }
        for (const path of this.multiPartFiles(folder, name, candidate)) {
          // A sibling of a multi-part file is never itself a multi-part template
          if (!path.startsWith(dir + sep) && (await this.isSibling(folder, name))) {
            continue;
          }
          if (this.contained(folder, path) && (await isFile(path))) {
            const engine = getEngineForExtension(
              path.substring(path.lastIndexOf(".") + 1),
              this.options.engine ?? "mustache"
            )!;
            (await engine.engine.parts!(path)).forEach(p => parts.add(p));
          }
        }
      }
      if (parts.size) {
        return [...parts].sort();
      }
    }
    return undefined;
  }

  /**
   * Render a template given as a string
   * @param source - the template source
   * @param data - the data
   * @param options - render options, `engine` selects the engine
   * @returns the rendered string
   */
  async renderString(
    source: string,
    data: any = {},
    options: TemplateRenderOptions & { engine?: string } = {}
  ): Promise<string> {
    const { engine: engineName, ...rest } = options;
    const name = engineName ?? this.options.engine ?? "mustache";
    const engine = getTemplateEngine(name);
    if (!engine) {
      throw new TemplateEngineNotFoundError(name);
    }
    return (await engine.compile(source, rest))(data, rest);
  }

  /**
   * Drop every cached compiled template
   */
  clearCache(): void {
    this.cache.clear();
  }
}
