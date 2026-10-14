export interface TemplateRenderOptions {
  /** Partials available to the template, by name */
  partials?: Record<string, string>;
  /** Locale used for the lookup, e.g. "fr-FR" */
  locale?: string;
  /** Whether HTML escaping is enabled (default true for HTML, false for text/subject) */
  escape?: boolean | ((value: any) => string);
  /** Engine-specific options */
  [key: string]: any;
}

export type CompiledTemplate = (data: any, options?: TemplateRenderOptions) => string | Promise<string>;

export interface TemplateEngine {
  /** File extensions handled by this engine, without the dot: ["mustache", "hbs"] */
  extensions: string[];
  /** Optional: receive `parameters.engines[<name>]` once, before the first use */
  configure?(options: any): void | Promise<void>;
  /** Compile a template source, the TemplateService caches the result */
  compile(source: string, options?: TemplateRenderOptions): CompiledTemplate | Promise<CompiledTemplate>;
  /** Optional: load a template from file path, for engines that import modules (e.g. tsx) */
  load?(path: string, options?: TemplateRenderOptions): CompiledTemplate | Promise<CompiledTemplate>;
}
