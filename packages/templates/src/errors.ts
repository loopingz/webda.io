import { WebdaError } from "@webda/core";

/**
 * Error code of the TemplateNotFoundError
 *
 * Compare errors by code: `@webda/templates` can be loaded twice (lib and src), breaking `instanceof`
 */
export const TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND";

/**
 * Thrown when a template cannot be found
 */
export class TemplateNotFoundError extends WebdaError.CodeError {
  /**
   * @param name - the template name
   */
  constructor(name: string) {
    super(TEMPLATE_NOT_FOUND, `Template '${name}' not found`);
  }
}

/**
 * Thrown when a template engine is not registered
 */
export class TemplateEngineNotFoundError extends WebdaError.CodeError {
  /**
   * @param name - the engine name
   */
  constructor(name: string) {
    super("TEMPLATE_ENGINE_NOT_FOUND", `Template engine '${name}' not found`);
  }
}
