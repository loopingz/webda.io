import * as ts from "typescript";
import type { WebdaModule } from "../definition";
import type { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Actions metadata plugin
 *
 * Detects actions on models from two sources:
 * 1. [WEBDA_ACTIONS] symbol property (declarative approach)
 * 2. @Operation/@Action decorated methods (decorator approach)
 */
export class ActionsMetadata extends MetadataPlugin {
  /**
   * Extract action names from WEBDA_ACTIONS symbols and @Operation/@Action decorators on models
   * @param module - the module to populate
   * @param objects - discovered Webda objects
   */
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    Object.keys(objects.models).forEach(name => {
      const model = objects.models[name];
      // Source 1: [WEBDA_ACTIONS] symbol property
      const actionsSymbol = model.type
        .getProperties()
        .find(p => this.moduleGenerator.propertyIsKeyedBySymbol(p, "@webda/models", "WEBDA_ACTIONS"));
      if (actionsSymbol) {
        const actionsType = this.moduleGenerator.typeChecker.getTypeOfSymbolAtLocation(
          actionsSymbol,
          actionsSymbol.valueDeclaration
        );
        const actionKeys = Object.keys(
          actionsType.getProperties().reduce((acc, prop) => {
            acc[prop.getName()] = true;
            return acc;
          }, {})
        );
        module.models[name].Actions = actionKeys.reduce((prev, value) => {
          prev[value] = {};
          return prev;
        }, {});
      }

      // Source 2: @Operation/@Action decorated methods (instance + static)
      const processMethod = (method: ts.MethodDeclaration) => {
        const methodName = method.name.getText();
        const actionMeta: Record<string, any> = {};

        // Detect static methods as global operations
        if (method.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword)) {
          actionMeta.global = true;
        }

        // Extract options from decorator arguments (only for @Operation({...}) form)
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
                if (key === "description" || key === "summary") {
                  if (ts.isStringLiteral(prop.initializer)) {
                    actionMeta[key] = prop.initializer.text;
                  }
                }
              }
            }
          }
        }

        module.models[name].Actions[methodName] = actionMeta;
      };

      // Instance methods (via type system - includes inherited)
      model.type
        .getProperties()
        .filter(
          prop =>
            prop.valueDeclaration?.kind === ts.SyntaxKind.MethodDeclaration &&
            this.moduleGenerator.hasOperationDecorator(<ts.MethodDeclaration>prop.valueDeclaration)
        )
        .forEach(prop => processMethod(<ts.MethodDeclaration>prop.valueDeclaration));

      // Static methods (scan class declaration directly)
      if (ts.isClassDeclaration(model.node as ts.Node)) {
        (<ts.ClassDeclaration>model.node).members
          .filter(
            (member): member is ts.MethodDeclaration =>
              ts.isMethodDeclaration(member) &&
              member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) &&
              this.moduleGenerator.hasOperationDecorator(member)
          )
          .forEach(processMethod);
      }
    });
  }
}
