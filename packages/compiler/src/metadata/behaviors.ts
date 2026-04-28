import * as ts from "typescript";
import type { BehaviorMetadata, WebdaModule } from "../definition";
import type { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Behaviors metadata plugin
 *
 * Scans every discovered class (via `objects.allClasses`) for the
 * `@WebdaBehavior` JSDoc tag and, for each such class, extracts its
 * `@Action` / `@Operation` instance methods into `module.behaviors`.
 *
 * Behaviors are intentionally NOT models, moddas, beans, or deployers — so
 * they are not present in those buckets. This plugin requires
 * `WebdaObjects.allClasses` to enumerate every TS class declaration found
 * during `searchForWebdaObjects`.
 *
 * Author syntax:
 * ```ts
 * /​**
 *  * @WebdaBehavior
 *  *​/
 * export class MFA { ... }
 *
 * /​**
 *  * @WebdaBehavior Auth/MFA
 *  *​/
 * export class CustomMFA { ... }
 * ```
 *
 * Validation rules:
 * - Static `@Action` methods are rejected (Behaviors must be instance methods).
 * - `@Action({ global: true })` is rejected for the same reason.
 */
export class BehaviorsMetadata extends MetadataPlugin {
  /**
   * Populate `module.behaviors` with one entry per class carrying the
   * `@WebdaBehavior` JSDoc tag.
   * @param module - the module to populate
   * @param objects - discovered Webda objects (must include `allClasses`)
   */
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    module.behaviors ??= {};

    const allClasses = objects.allClasses ?? [];

    for (const cls of allClasses) {
      if (!this.hasBehaviorTag(cls.node)) continue;

      const identifier = this.resolveBehaviorIdentifier(cls);
      const actions: BehaviorMetadata["Actions"] = {};

      const processMethod = (method: ts.MethodDeclaration) => {
        const methodName = method.name.getText();
        const isStatic = method.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
        if (isStatic) {
          throw new Error(
            `Behavior ${identifier}: static @Action methods are not allowed (method "${methodName}").`
          );
        }
        const actionMeta: Record<string, any> = {};
        const decorator = ts.getDecorators(method)?.find(annotation => {
          const dname = this.moduleGenerator.getDecoratorName(annotation);
          return dname === "Action" || dname === "Operation";
        });
        if (decorator && ts.isCallExpression(decorator.expression) && decorator.expression.arguments.length > 0) {
          const arg = decorator.expression.arguments[0];
          if (ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const key = prop.name.text;
                if (key === "global") {
                  throw new Error(
                    `Behavior ${identifier}: @Action({ global: true }) is not allowed (method "${methodName}").`
                  );
                }
                if ((key === "description" || key === "summary") && ts.isStringLiteral(prop.initializer)) {
                  actionMeta[key] = prop.initializer.text;
                }
              }
            }
          }
        }
        actions[methodName] = actionMeta;
      };

      // Instance methods (via type system - includes inherited)
      cls.type
        .getProperties()
        .filter(
          prop =>
            prop.valueDeclaration?.kind === ts.SyntaxKind.MethodDeclaration &&
            this.moduleGenerator.hasOperationDecorator(<ts.MethodDeclaration>prop.valueDeclaration)
        )
        .forEach(prop => processMethod(<ts.MethodDeclaration>prop.valueDeclaration));

      // Static methods (scan class declaration directly) — these will trigger the
      // static-method rejection in `processMethod`, which is the desired behaviour.
      if (ts.isClassDeclaration(cls.node as ts.Node)) {
        (<ts.ClassDeclaration>cls.node).members
          .filter(
            (member): member is ts.MethodDeclaration =>
              ts.isMethodDeclaration(member) &&
              !!member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
              this.moduleGenerator.hasOperationDecorator(member)
          )
          .forEach(processMethod);
      }

      module.behaviors[identifier] = {
        Identifier: identifier,
        Import: cls.jsFile,
        Actions: actions
      };
    }
  }

  /**
   * Check whether a class node carries the `@WebdaBehavior` JSDoc tag.
   * @param node - candidate class node
   * @returns true if the class is annotated with `@WebdaBehavior`
   */
  private hasBehaviorTag(node: ts.Node): boolean {
    if (!ts.isClassDeclaration(node) && !ts.isClassExpression(node)) return false;
    return this.findBehaviorTag(node) !== undefined;
  }

  /**
   * Find the `@WebdaBehavior` JSDoc tag on a class node, if present.
   * @param node - the class declaration / expression node
   * @returns the matching JSDoc tag, or undefined if not annotated
   */
  private findBehaviorTag(node: ts.Node): ts.JSDocTag | undefined {
    return ts.getJSDocTags(node).find(tag => tag.tagName.escapedText.toString() === "WebdaBehavior");
  }

  /**
   * Resolve the Behavior identifier, honouring an optional payload on the
   * `@WebdaBehavior` tag (e.g. `@WebdaBehavior Auth/MFA`). Falls back to the
   * namespaced class name resolved via the project namespace.
   * @param cls - class entry from `WebdaObjects.allClasses`
   * @param cls.name - already-namespaced class name (used as the fallback identifier)
   * @param cls.node - the class declaration node, used to read the `@WebdaBehavior` tag
   * @returns resolved identifier, e.g. "Webda/MFA"
   */
  private resolveBehaviorIdentifier(cls: { name: string; node: ts.Node }): string {
    if (ts.isClassDeclaration(cls.node) || ts.isClassExpression(cls.node)) {
      const tag = this.findBehaviorTag(cls.node);
      if (tag) {
        const override = ts.getTextOfJSDocComment(tag.comment)?.trim();
        if (override) {
          // Take only the first whitespace-delimited token, mirroring how
          // other Webda* JSDoc tags (e.g. @WebdaCapability) parse their payload.
          const firstToken = override.split(/\s+/).shift();
          if (firstToken) {
            return firstToken;
          }
        }
      }
    }
    // Fall back to namespaced class name. `compiler.project` may be unavailable
    // in unit tests with mocked module generators, so guard against that.
    const project = (this.moduleGenerator as any).compiler?.project;
    if (project && typeof project.completeNamespace === "function") {
      return project.completeNamespace(cls.name);
    }
    return cls.name.includes("/") ? cls.name : `Webda/${cls.name}`;
  }
}
