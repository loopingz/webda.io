/**
 * Options given to an engine at compile or render time
 */
export interface TemplateRenderOptions {
  /**
   * Partials available to the template, by name
   */
  partials?: { [name: string]: string };
  /**
   * Locale being rendered
   */
  locale?: string;
  /**
   * Engine specific options
   */
  [key: string]: any;
}

/**
 * A compiled template: renders the data into a string
 */
export type CompiledTemplate = (data: any, options?: TemplateRenderOptions) => string | Promise<string>;

/**
 * Template engine contract
 */
export interface TemplateEngine {
  /**
   * File extensions handled by the engine (without the dot)
   */
  extensions: string[];
  /**
   * Configure the engine
   * @param options - engine specific options
   */
  configure?(options: any): void | Promise<void>;
  /**
   * Compile a template source
   * @param source - the template source
   * @param options - compile options
   */
  compile(source: string, options?: TemplateRenderOptions): CompiledTemplate | Promise<CompiledTemplate>;
  /**
   * Optional: load a template from its path instead of readFile + compile (module-based engines, e.g. tsx)
   * @param path - the template path
   * @param options - compile options
   */
  load?(path: string, options?: TemplateRenderOptions): Promise<CompiledTemplate>;
}
