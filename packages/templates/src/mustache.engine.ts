import Mustache from "mustache";
import type { CompiledTemplate, TemplateEngine, TemplateRenderOptions } from "./itemplate.js";
import { registerTemplateEngine } from "./engines.js";

/**
 * Mustache template engine
 */
export class MustacheEngine implements TemplateEngine {
  extensions = ["mustache"];

  /**
   * Compile a mustache source
   * @param source - the template source
   * @param options - compile options, `partials` are merged with the render ones
   * @returns the render function
   */
  compile(source: string, options?: TemplateRenderOptions): CompiledTemplate {
    return function renderMustache(data: any, opts?: TemplateRenderOptions): string {
      return Mustache.render(source, data, { ...options?.partials, ...opts?.partials });
    };
  }
}

registerTemplateEngine("mustache", new MustacheEngine());
