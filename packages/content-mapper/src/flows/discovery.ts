/**
 * What a flow can call: the operations of the project's services, and the flow classes.
 *
 * Shared by the declaration injection (`generators/flows.ts`) and the compiler (`compile.ts`), so a call the editor
 * types is a call the build compiles.
 */
import type { ClassDeclaration, MethodDeclaration, Node, SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { Type } from "typescript/unstable/sync";
import type { AnalysisContext } from "../plan.ts";
import { derivesFrom } from "../schema/service.ts";
import { isContextType } from "../schema/action.ts";
import { capitalize } from "./types.ts";

/** Suffix of a flow file. */
export const FLOW_SUFFIX = ".flow.ts";

/** One parameter of a service operation, as the typed call takes it. */
export interface OperationParameter {
  name: string;
  /** Position in the method signature (context parameters included). */
  index: number;
  optional: boolean;
}

/** An `@Operation` method of a service. */
export interface ServiceOperation {
  /** Method name, as declared. */
  method: string;
  /** Input keys, context parameters excluded. */
  parameters: OperationParameter[];
}

/** A service class with operations. */
export interface OperationService {
  className: string;
  fileName: string;
  /** Operations by capitalized method name. */
  operations: Map<string, ServiceOperation>;
  /**
   * Capitalized names that several methods share (`capture` and `Capture`): the same operation id, so no typed call
   */
  conflicts: Map<string, string[]>;
}

/**
 * Decorators of a node
 * @param node - a class or class element
 * @returns the decorator nodes
 */
export function decoratorsOf(node: Node): any[] {
  return ((node as any).modifiers ?? []).filter((modifier: Node) => modifier.kind === SyntaxKind.Decorator);
}

/**
 * Name of a decorator, for both `@Name` and `@Name(...)`
 * @param decorator - the decorator
 * @returns the name, when the expression is an identifier or a call on one
 */
export function decoratorName(decorator: any): string | undefined {
  const expression = decorator.expression;
  if (is.isIdentifier(expression)) return (expression as any).text;
  if (is.isCallExpression(expression) && is.isIdentifier((expression as any).expression)) {
    return (expression as any).expression.text;
  }
  return undefined;
}

/**
 * Whether a node carries a modifier
 * @param node - the node
 * @param kind - the modifier kind
 * @returns true when present
 */
export function hasModifier(node: Node, kind: SyntaxKind): boolean {
  return ((node as any).modifiers ?? []).some((modifier: Node) => modifier.kind === kind);
}

/**
 * Instance type of a class declaration
 * @param ctx - analysis context
 * @param cls - the class
 * @returns the declared type
 */
function declaredTypeOf(ctx: AnalysisContext, cls: ClassDeclaration): Type | undefined {
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  return symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
}

/**
 * Whether a class extends `Workflow`
 * @param ctx - analysis context
 * @param cls - the class
 * @returns true for a flow class
 */
export function isFlowClass(ctx: AnalysisContext, cls: ClassDeclaration): boolean {
  if (!cls.heritageClauses?.length) return false;
  const type = declaredTypeOf(ctx, cls);
  return !!type && derivesFrom(type, "Workflow", ctx.checker);
}

/**
 * Flow classes of a file
 * @param ctx - analysis context
 * @param sf - a `.flow.ts` file
 * @returns the class declarations extending `Workflow`
 */
export function flowClassesOf(ctx: AnalysisContext, sf: SourceFile): ClassDeclaration[] {
  return sf.statements.filter(
    (statement): statement is ClassDeclaration =>
      is.isClassDeclaration(statement) && !!statement.name && isFlowClass(ctx, statement)
  );
}

/**
 * The flow methods of a flow class: its instance methods
 * @param cls - the flow class
 * @returns the method declarations
 */
export function flowMethodsOf(cls: ClassDeclaration): MethodDeclaration[] {
  return cls.members.filter(
    (member): member is MethodDeclaration =>
      is.isMethodDeclaration(member) &&
      is.isIdentifier((member as any).name) &&
      !hasModifier(member, SyntaxKind.StaticKeyword) &&
      !hasModifier(member, SyntaxKind.PrivateKeyword) &&
      !hasModifier(member, SyntaxKind.ProtectedKeyword)
  );
}

/**
 * Whether a parameter can be omitted
 * @param parameter - the parameter declaration
 * @returns true when optional or defaulted
 */
function isOptional(parameter: any): boolean {
  return parameter.questionToken !== undefined || parameter.initializer !== undefined;
}

/**
 * The project's services with `@Operation` methods, by class name
 *
 * Only exported classes of the project's own sources (no declaration file, nothing under `node_modules`): the typed
 * call refers to the class through `import("<relative path>")`. A class name declared twice maps to `undefined`: no
 * typed call, as it would be ambiguous. Operations of other packages are called with `Workflow.Call`.
 * @param ctx - analysis context
 * @returns the services
 */
export function operationServices(ctx: AnalysisContext): Map<string, OperationService | undefined> {
  const services = new Map<string, OperationService | undefined>();
  for (const fileName of ctx.program.getSourceFileNames()) {
    if (fileName.endsWith(".d.ts") || fileName.includes("/node_modules/") || fileName.endsWith(FLOW_SUFFIX)) continue;
    const sf = ctx.program.getSourceFile(fileName);
    if (!sf) continue;
    for (const statement of sf.statements) {
      if (!is.isClassDeclaration(statement) || !statement.name) continue;
      if (!hasModifier(statement, SyntaxKind.ExportKeyword) || hasModifier(statement, SyntaxKind.DefaultKeyword)) {
        continue;
      }
      const methods = statement.members.filter(
        (member): member is MethodDeclaration =>
          is.isMethodDeclaration(member) &&
          is.isIdentifier((member as any).name) &&
          !hasModifier(member, SyntaxKind.StaticKeyword) &&
          !hasModifier(member, SyntaxKind.PrivateKeyword) &&
          !hasModifier(member, SyntaxKind.ProtectedKeyword) &&
          decoratorsOf(member).some(decorator => decoratorName(decorator) === "Operation")
      );
      if (!methods.length) continue;
      const type = declaredTypeOf(ctx, statement);
      if (!type || !derivesFrom(type, "Service", ctx.checker)) continue;
      const className = statement.name.text;
      if (services.has(className)) {
        services.set(className, undefined);
        continue;
      }
      const operations = new Map<string, ServiceOperation>();
      const conflicts = new Map<string, string[]>();
      for (const method of methods) {
        const parameters: OperationParameter[] = [];
        method.parameters.forEach((parameter: any, index: number) => {
          if (!is.isIdentifier(parameter.name) || parameter.dotDotDotToken) return;
          const parameterType = ctx.checker.getTypeAtLocation(parameter);
          if (parameterType && isContextType(parameterType, ctx.checker)) return;
          parameters.push({ name: parameter.name.text, index, optional: isOptional(parameter) });
        });
        const name = (method.name as any).text as string;
        const key = capitalize(name);
        const conflict = conflicts.get(key) ?? (operations.has(key) ? [operations.get(key)!.method] : undefined);
        if (conflict) {
          conflicts.set(key, [...conflict, name]);
          operations.delete(key);
          continue;
        }
        operations.set(key, { method: name, parameters });
      }
      services.set(className, { className, fileName, operations, conflicts });
    }
  }
  return services;
}
