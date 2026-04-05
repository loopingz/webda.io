import * as ts from "typescript";
import type { CommandArgDefinition, CommandDefinition, WebdaModule } from "../definition.js";
import type { WebdaObjects } from "../module.js";
import { MetadataPlugin } from "./plugin.js";

/**
 * Commands metadata plugin
 *
 * Detects CLI commands on services and beans from @Command decorated methods.
 * Extracts method parameters (name, type, defaults, JSDoc hints) and writes
 * them into webda.module.json under moddas[name].commands and beans[name].commands.
 */
export class CommandsMetadata extends MetadataPlugin {
  /**
   * Iterate over all moddas and beans, extract `@Command`-decorated methods,
   * and write the resulting command definitions into the module metadata.
   *
   * @param module - The module definition being built; commands are written
   *   into `module[section][name].commands`
   * @param objects - Resolved service/bean objects containing AST nodes
   *   for each declared service
   */
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    for (const section of ["moddas", "beans"] as const) {
      for (const name of Object.keys(objects[section])) {
        const searchResult = objects[section][name];
        const commands = this.extractCommands(searchResult.node as ts.Node);
        if (Object.keys(commands).length > 0) {
          module[section][name].commands = commands;
        }
      }
    }
  }

  /**
   * Extract all `@Command`-decorated methods from a class declaration and
   * return a map of command name to its definition.
   *
   * Iterates over every member of the class. For each method that carries a
   * `@Command` decorator, delegates to {@link extractCommandDefinition} to
   * parse the decorator arguments and method signature.
   *
   * @param classNode - The AST node for the class declaration to inspect.
   *   If not a class declaration, returns an empty map.
   * @returns Map of command name (e.g., `"serve"`) to its {@link CommandDefinition}.
   *   Empty object if the class has no `@Command`-decorated methods.
   */
  private extractCommands(classNode: ts.Node): { [name: string]: CommandDefinition } {
    const commands: { [name: string]: CommandDefinition } = {};

    if (!ts.isClassDeclaration(classNode)) return commands;

    for (const member of classNode.members) {
      if (!ts.isMethodDeclaration(member)) continue;

      const decorator = ts.getDecorators(member)?.find(annotation => {
        const dname = this.moduleGenerator.getDecoratorName(annotation);
        return dname === "Command";
      });

      if (!decorator) continue;

      const methodName = member.name.getText();
      const commandDef = this.extractCommandDefinition(decorator, methodName, member);
      if (commandDef) {
        commands[commandDef.commandName] = commandDef.definition;
      }
    }

    return commands;
  }

  /**
   * Parse a `@Command` decorator and method signature into a command name
   * and its full definition including arguments.
   *
   * The decorator is expected to be called as `@Command("name", { description: "..." })`.
   * The first argument is the command name (required string literal), and the
   * second is an optional options object with a `description` property.
   *
   * @param decorator - The `@Command` decorator AST node
   * @param methodName - The name of the decorated method (used as the `method` field)
   * @param method - The method declaration, used to extract parameter definitions
   * @returns An object with `commandName` and `definition`, or `undefined` if
   *   the decorator is not a valid call expression or has no string literal name
   */
  private extractCommandDefinition(
    decorator: ts.Decorator,
    methodName: string,
    method: ts.MethodDeclaration
  ): { commandName: string; definition: CommandDefinition } | undefined {
    if (!ts.isCallExpression(decorator.expression)) return undefined;

    const args = decorator.expression.arguments;
    if (args.length === 0) return undefined;

    // First arg: command name (string literal)
    const firstArg = args[0];
    if (!ts.isStringLiteral(firstArg)) return undefined;
    const commandName = firstArg.text;

    // Second arg (optional): options object { description: "..." }
    let description = "";
    if (args.length > 1 && ts.isObjectLiteralExpression(args[1])) {
      for (const prop of args[1].properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "description" &&
          ts.isStringLiteral(prop.initializer)
        ) {
          description = prop.initializer.text;
        }
      }
    }

    // Extract parameters
    const methodArgs: { [name: string]: CommandArgDefinition } = {};
    for (const param of method.parameters) {
      const paramName = param.name.getText();
      const paramDef = this.extractParamDefinition(param, method.getSourceFile());
      if (paramDef) {
        methodArgs[paramName] = paramDef;
      }
    }

    return {
      commandName,
      definition: {
        description,
        method: methodName,
        args: methodArgs
      }
    };
  }

  /**
   * Extract a single method parameter's type, default value, and JSDoc metadata
   * into a {@link CommandArgDefinition}.
   *
   * Determines the argument type from the TypeScript type annotation (defaults to
   * `"string"`), checks whether the parameter is required (no default, no `?`),
   * extracts the default value from the initializer, and reads `@alias`,
   * `@description`, and `@deprecated` from leading JSDoc comments.
   *
   * @param param - The parameter declaration AST node to analyze
   * @param sourceFile - The source file containing the parameter, needed to
   *   read leading comment ranges for JSDoc tag extraction
   * @returns The argument definition, or `undefined` if the parameter cannot
   *   be represented as a CLI argument
   */
  private extractParamDefinition(param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): CommandArgDefinition | undefined {
    // Determine type
    let type: "string" | "number" | "boolean" = "string";
    if (param.type) {
      const typeText = param.type.getText().toLowerCase().trim();
      if (typeText === "number") {
        type = "number";
      } else if (typeText === "boolean") {
        type = "boolean";
      } else {
        type = "string";
      }
    }

    const def: CommandArgDefinition = { type };

    // Check if required: no default value and no question token
    if (!param.initializer && !param.questionToken) {
      def.required = true;
    }

    // Extract default value
    if (param.initializer) {
      if (ts.isStringLiteral(param.initializer)) {
        def.default = param.initializer.text;
      } else if (ts.isNumericLiteral(param.initializer)) {
        def.default = Number(param.initializer.text);
      } else if (param.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        def.default = true;
      } else if (param.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        def.default = false;
      }
    }

    // Extract JSDoc tags from leading comments on the parameter
    const jsDocTags = this.extractJSDocTagsFromParam(param, sourceFile);
    if (jsDocTags.alias) def.alias = jsDocTags.alias;
    if (jsDocTags.description) def.description = jsDocTags.description;
    if (jsDocTags.deprecated !== undefined) def.deprecated = jsDocTags.deprecated;

    return def;
  }

  /**
   * Parse leading comment ranges on a parameter declaration to extract
   * `@alias`, `@description`, and `@deprecated` JSDoc tags.
   *
   * Uses `ts.getLeadingCommentRanges` to find comments immediately before
   * the parameter token, then applies regex patterns to extract tag values.
   *
   * @param param - The parameter declaration whose leading comments to inspect
   * @param sourceFile - The source file, used to obtain the full text for
   *   comment range slicing
   * @returns An object with optional `alias`, `description`, and `deprecated`
   *   fields. All fields are omitted if no matching tags are found.
   */
  private extractJSDocTagsFromParam(
    param: ts.ParameterDeclaration,
    sourceFile: ts.SourceFile
  ): { alias?: string; description?: string; deprecated?: string } {
    const result: { alias?: string; description?: string; deprecated?: string } = {};
    const fullText = sourceFile.getFullText();
    const paramStart = param.getFullStart();

    const commentRanges = ts.getLeadingCommentRanges(fullText, paramStart);
    if (!commentRanges) return result;

    for (const range of commentRanges) {
      const commentText = fullText.slice(range.pos, range.end);
      // Parse @alias, @description, @deprecated from comment text
      const aliasMatch = commentText.match(/@alias\s+(\S+)/);
      if (aliasMatch) result.alias = aliasMatch[1];

      const descMatch = commentText.match(/@description\s+(.+?)(?:\n|$|\*\/)/);
      if (descMatch) result.description = descMatch[1].trim().replace(/\s*\*\s*/g, " ").trim();

      const deprecatedMatch = commentText.match(/@deprecated\s*(.*?)(?:\n|$|\*\/)/);
      if (deprecatedMatch) result.deprecated = deprecatedMatch[1].trim().replace(/\s*\*\s*/g, " ").trim() || "";
    }

    return result;
  }
}
