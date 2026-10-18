import Mustache from "mustache";
import type { CompiledTemplate, TemplateEngine, TemplateRenderOptions } from "./itemplate.js";

/**
 * Mustache template engine implementation
 */
export class MustacheEngine implements TemplateEngine {
  /**
   * File extensions handled by this engine
   */
  extensions = ["mustache"];

  /**
   * Optional configuration for the mustache engine
   *
   * @param options - Configuration options
   */
  configure?(options: any): void {
    // Mustache does not need global configuration, but options can be passed
  }

  /**
   * Compile a mustache template source
   *
   * @param source - The mustache template string
   * @param options - Compilation and render options
   * @returns Compiled template function
   */
  compile(source: string, options?: TemplateRenderOptions): CompiledTemplate {
    return (data: any, renderOptions?: TemplateRenderOptions) => {
      const mergedPartials = { ...options?.partials, ...renderOptions?.partials };
      const mergedOptions = { ...options, ...renderOptions, partials: mergedPartials };
      const config: any = {};
      if (mergedOptions?.escape === false) {
        // Mustache omits null and undefined values before calling the escape function.
        config.escape = String;
      } else if (typeof mergedOptions?.escape === "function") {
        config.escape = mergedOptions.escape;
      }
      return Mustache.render(source, data, mergedPartials, config);
    };
  }
}
