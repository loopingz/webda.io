import { Counter, Service, ServiceParameters, useCore } from "@webda/core";
import type { ServicePartialParameters } from "@webda/core";
import { stat } from "fs/promises";
import { resolve } from "path";
import { getTemplateEngine, listTemplateEngines, registerTemplateEngine } from "./engines.js";
import type { TemplateEngine, TemplateRenderOptions } from "./itemplate.js";
import "./mustache.engine.js";
import { TemplateRenderer } from "./renderer.js";

/**
 * Parameters of the TemplateService
 */
export class TemplateServiceParameters extends ServiceParameters {
  /**
   * Folders to look templates into, in priority order
   * @default ["./templates"]
   */
  folders?: string[];
  /**
   * Engine winning when several handle the same extension
   * @default "mustache"
   */
  engine?: string;
  /**
   * Engine options, keyed by engine name, passed to the engine `configure`
   */
  engines?: Record<string, any>;
  /**
   * Cache compiled templates, always disabled in debug mode
   * @default true
   */
  cache?: boolean;

  /**
   * Apply the defaults
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.folders ??= ["./templates"];
    this.engine ??= "mustache";
    this.engines ??= {};
    this.cache ??= true;
    return this;
  }
}

/**
 * Render templates from folders with a pluggable engine, locale fallback and partials
 *
 * @WebdaModda
 */
export class TemplateService<T extends TemplateServiceParameters = TemplateServiceParameters> extends Service<T> {
  /**
   * Template metrics
   */
  declare metrics: {
    render: Counter;
    errors: Counter;
  };
  protected renderer: TemplateRenderer;
  protected configuring: Promise<void>[] = [];

  /**
   * Register a template engine, usable from every TemplateService
   * @param name - the engine name
   * @param engine - the engine
   */
  static registerEngine(name: string, engine: TemplateEngine): void {
    registerTemplateEngine(name, engine);
  }

  /**
   * Get a registered engine
   * @param name - the engine name
   * @returns the engine or undefined
   */
  static getEngine(name: string): TemplateEngine | undefined {
    return getTemplateEngine(name);
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
  initMetrics() {
    super.initMetrics();
    this.metrics.render = this.getMetric(Counter, {
      name: "template_render",
      help: "Number of templates rendered",
      labelNames: ["engine"]
    });
    this.metrics.errors = this.getMetric(Counter, {
      name: "template_errors",
      help: "Number of templates in error"
    });
  }

  /**
   * Configure the engines that have options
   * @override
   */
  resolve(): this {
    super.resolve();
    this.configuring = [];
    const options = this.parameters.engines ?? {};
    for (const name of listTemplateEngines()) {
      const engine = getTemplateEngine(name)!;
      if (name in options && engine.configure) {
        // Started here, awaited in init()
        this.configuring.push(
          Promise.resolve()
            .then(() => engine.configure!(options[name]))
            .catch(err => {
              this.log("ERROR", `Engine '${name}' configuration failed`, err);
              throw err;
            })
        );
      }
    }
    return this;
  }

  /**
   * Warn on missing folders and build the renderer
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    // A failing engine configuration fails the init
    await Promise.all(this.configuring);
    for (const folder of this.parameters.folders!) {
      const isDir = await stat(resolve(process.cwd(), folder)).then(
        s => s.isDirectory(),
        () => false
      );
      if (!isDir) {
        this.log("WARN", `Template folder '${folder}' does not exist`);
      }
    }
    this.renderer = new TemplateRenderer({
      folders: this.parameters.folders!,
      engine: this.parameters.engine,
      cache: this.parameters.cache !== false && !useCore().isDebug(),
      defaultLocale: () => useCore().getLocales()?.[0]
    });
    return this;
  }

  /**
   * Get the underlying renderer
   * @returns the renderer
   */
  getRenderer(): TemplateRenderer {
    return this.renderer;
  }

  /**
   * Count a call and its errors
   * @param engine - engine label
   * @param fn - the render call
   * @returns the result
   */
  protected async track<R>(engine: string | undefined, fn: () => Promise<R>): Promise<R> {
    this.metrics.render.inc({ engine: engine ?? this.parameters.engine });
    try {
      return await fn();
    } catch (err) {
      this.metrics.errors.inc();
      throw err;
    }
  }

  /**
   * Check a template exists
   * @param name - `NAME` or `NAME/part`
   * @param options - lookup options
   * @param options.locale - locale to look for
   * @returns true if found
   */
  has(name: string, options?: { locale?: string }): Promise<boolean> {
    return this.renderer.has(name, options);
  }

  /**
   * List the template names
   * @returns sorted names
   */
  list(): Promise<string[]> {
    return this.renderer.list();
  }

  /**
   * Render a template
   * @param name - `NAME` or `NAME/part`
   * @param data - the data
   * @param options - render options, `locale` selects the language
   * @returns the rendered string
   */
  render(name: string, data: any = {}, options: TemplateRenderOptions = {}): Promise<string> {
    return this.track(undefined, () => this.renderer.render(name, data, options));
  }

  /**
   * Render every part of a multi-part template
   * @param name - the multi-part template name
   * @param data - the data
   * @param options - render options
   * @returns the rendered parts keyed by part name
   */
  renderAll(name: string, data: any = {}, options: TemplateRenderOptions = {}): Promise<Record<string, string>> {
    return this.track(undefined, () => this.renderer.renderAll(name, data, options));
  }

  /**
   * Render a template given as a string
   * @param source - the template source
   * @param data - the data
   * @param options - render options, `engine` selects the engine
   * @returns the rendered string
   */
  renderString(
    source: string,
    data: any = {},
    options: TemplateRenderOptions & { engine?: string } = {}
  ): Promise<string> {
    return this.track(options.engine, () => this.renderer.renderString(source, data, options));
  }
}

declare module "@webda/core" {
  interface ServicesMap {
    TemplateService: TemplateService;
  }
}
