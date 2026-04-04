import { createMethodDecorator } from "@webda/tsc-esm";

export interface CommandOptions {
  description: string;
}

/**
 * Declare a CLI command on a service method.
 *
 * The method parameters define the CLI arguments:
 * - Parameter name → --flag name
 * - TypeScript type → flag type (string, number, boolean)
 * - Default value → flag default
 * - JSDoc @alias on param → single-char alias
 * - JSDoc @description on param → flag help text
 * - JSDoc @deprecated on param → marks flag deprecated
 *
 * @param name Command name, space-separated for subcommands (e.g. "aws s3")
 * @param options Command options
 */
export const Command = createMethodDecorator(
  (
    value: any,
    context: ClassMethodDecoratorContext,
    name: string,
    options: CommandOptions = { description: "" }
  ) => {
    context.metadata["webda.commands"] ??= [];
    (context.metadata["webda.commands"] as any[]).push({
      name,
      description: options.description,
      method: context.name
    });
  }
);
