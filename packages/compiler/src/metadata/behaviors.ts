import * as ts from "typescript";
import type { BehaviorMetadata, WebdaModule } from "../definition";
import type { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Behaviors metadata plugin
 *
 * Scans every discovered class (via `objects.allClasses`) for the
 * `@Behavior` class decorator and, for each such class, extracts its
 * `@Action` / `@Operation` instance methods into `module.behaviors`.
 *
 * Behaviors are intentionally NOT models, moddas, beans, or deployers — so
 * they are not present in those buckets. This plugin requires
 * `WebdaObjects.allClasses` to enumerate every TS class declaration found
 * during `searchForWebdaObjects`.
 *
 * Validation rules:
 * - Static `@Action` methods are rejected (Behaviors must be instance methods).
 * - `@Action({ global: true })` is rejected for the same reason.
 */
export class BehaviorsMetadata extends MetadataPlugin {
  /**
   * Populate `module.behaviors` with one entry per class carrying `@Behavior`.
   * @param module - the module to populate
   * @param objects - discovered Webda objects (must include `allClasses`)
   */
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    module.behaviors ??= {};

    const allClasses = objects.allClasses ?? [];

    for (const cls of allClasses) {
      if (!this.hasBehaviorDecorator(cls.node)) continue;

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
   * Check whether a class node carries the `@Behavior` decorator.
   * @param node - candidate class node
   * @returns true if the class is decorated with `@Behavior`
   */
  private hasBehaviorDecorator(node: ts.Node): boolean {
    if (!ts.isClassDeclaration(node) && !ts.isClassExpression(node)) return false;
    return (ts.getDecorators(node) ?? []).some(d => this.moduleGenerator.getDecoratorName(d) === "Behavior");
  }

  /**
   * Resolve the Behavior identifier, honouring an `identifier` override
   * passed to `@Behavior({ identifier: "Foo/Bar" })`. Falls back to the
   * namespaced class name resolved via the project namespace.
   * @param cls - class entry from `WebdaObjects.allClasses`
   * @param cls.name - already-namespaced class name (used as the fallback identifier)
   * @param cls.node - the class declaration node, used to read the @Behavior decorator
   * @returns resolved identifier, e.g. "Webda/MFA"
   */
  private resolveBehaviorIdentifier(cls: { name: string; node: ts.Node }): string {
    if (ts.isClassDeclaration(cls.node)) {
      const decorator = ts
        .getDecorators(cls.node)
        ?.find(d => this.moduleGenerator.getDecoratorName(d) === "Behavior");
      if (decorator && ts.isCallExpression(decorator.expression) && decorator.expression.arguments.length > 0) {
        const arg = decorator.expression.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === "identifier" &&
              ts.isStringLiteral(prop.initializer)
            ) {
              return prop.initializer.text;
            }
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
