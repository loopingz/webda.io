import { getTemplateEngine, registerTemplateEngine } from "@webda/templates";
import type { CompiledTemplate, TemplateEngine, TemplateRenderOptions } from "@webda/templates";
import { NoDefaultExportError, importEmail, type EmailComponent } from "./loader.js";
import { renderEmail, type RenderedEmail } from "./render.js";

/**
 * Options of the react-email engine
 */
export interface ReactEmailEngineOptions {
  /**
   * Source prefix to compiled prefix map, to load compiled emails at runtime
   */
  sourceMap?: Record<string, string>;
  /**
   * Pretty print the html
   * @default false
   */
  pretty?: boolean;
  /**
   * Replace `&#x27;` by `'`
   * @default true
   */
  fixApostrophes?: boolean;
  /**
   * File extensions handled by the engine
   * @default ["tsx", "jsx"]
   */
  extensions?: string[];
}

type Memo = WeakMap<
  EmailComponent,
  WeakMap<object, Map<string, { fingerprint: string; promise: Promise<RenderedEmail> }>>
>;

/**
 * Template engine rendering react-email components
 */
export class ReactEmailEngine implements TemplateEngine {
  extensions = ["tsx", "jsx"];
  protected options: ReactEmailEngineOptions = { pretty: false, fixApostrophes: true };
  protected memo: Memo = new WeakMap();

  /**
   * Configure the engine
   * @param options - engine options
   */
  configure(options: ReactEmailEngineOptions = {}): void {
    this.options = { pretty: false, fixApostrophes: true, ...options };
    this.extensions = options.extensions ?? ["tsx", "jsx"];
    this.memo = new WeakMap();
  }

  /**
   * Not supported: react-email templates are modules
   */
  compile(): CompiledTemplate {
    throw new Error("react-email templates are modules: render them from a template folder");
  }

  /**
   * List the parts of an email module
   *
   * A module without a default export component (a shared helper) has no part, so it is not a template
   * @param path - the module path
   * @returns the parts
   */
  async parts(path: string): Promise<string[]> {
    let component: EmailComponent;
    try {
      component = await importEmail(path, this.options.sourceMap);
    } catch (err) {
      if (err instanceof NoDefaultExportError) {
        return [];
      }
      throw err;
    }
    return ["html", ...(component.Subject !== undefined ? ["subject"] : []), "text"];
  }

  /**
   * Load an email module
   * @param path - the module path
   * @param options - load options, `part` selects the part rendered
   * @returns the compiled template
   */
  async load(path: string, options?: TemplateRenderOptions): Promise<CompiledTemplate> {
    const component = await importEmail(path, this.options.sourceMap);
    const part = (options?.part ?? "html") as keyof RenderedEmail;
    const rendered = this.rendered.bind(this);
    return async function renderReactEmail(data: any, opts?: TemplateRenderOptions): Promise<string> {
      const locale = opts?.locale ?? options?.locale;
      return (await rendered(component, data ?? {}, locale))[part] ?? "";
    };
  }

  /**
   * Render once per component, data object and locale
   *
   * Each entry keeps a `JSON.stringify` fingerprint of the data and is rendered again when the data was mutated
   * in between; data that cannot be serialized is never memoized.
   * @param component - the email component
   * @param data - the data
   * @param locale - the locale
   * @returns the rendered email
   */
  protected rendered(component: EmailComponent, data: object, locale?: string): Promise<RenderedEmail> {
    const render = () => renderEmail(component, { ...data, locale: locale ?? (data as any).locale }, this.options);
    let fingerprint: string;
    try {
      fingerprint = JSON.stringify(data);
    } catch {
      return render();
    }
    let byData = this.memo.get(component);
    if (!byData) {
      byData = new WeakMap();
      this.memo.set(component, byData);
    }
    let byLocale = byData.get(data);
    if (!byLocale) {
      byLocale = new Map();
      byData.set(data, byLocale);
    }
    const key = String(locale);
    const entry = byLocale.get(key);
    if (entry && entry.fingerprint === fingerprint) {
      return entry.promise;
    }
    const promise = render();
    byLocale.set(key, { fingerprint, promise });
    promise.catch(() => {
      if (byLocale.get(key)?.promise === promise) {
        byLocale.delete(key);
      }
    });
    return promise;
  }
}

if (!getTemplateEngine("react-email")) {
  registerTemplateEngine("react-email", new ReactEmailEngine());
}
