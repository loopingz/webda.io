import ts from "typescript";
import { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";
import { WebdaModule } from "../definition";

/**
 * Primary key metadata plugin
 */
export class PrimaryKeyMetadata extends MetadataPlugin {
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    Object.keys(objects.models).forEach(name => {
      const { type } = objects.models[name];
      const primarySymbol = type
        .getProperties()
        .find(p => this.moduleGenerator.propertyIsKeyedBySymbol(p, "@webda/models", "WEBDA_PRIMARY_KEY"));
      if (primarySymbol) {
        module.models[name].PrimaryKey ??= [];
        const valDecl = primarySymbol.valueDeclaration;
        if (!valDecl) return;

        // Strategy 1: explicit type annotation with `readonly` keyword (e.g. `readonly ["uuid"]`)
        const typeOpNode = valDecl.getChildren().find(c => ts.isTypeOperatorNode(c));
        if (typeOpNode?.operator === ts.SyntaxKind.ReadonlyKeyword) {
          const inner = typeOpNode.type;
          if (ts.isTupleTypeNode(inner)) {
            inner.elements.forEach((element) => {
              if (ts.isLiteralTypeNode(element)) {
                module.models[name].PrimaryKey.push(element.literal.getText().replace(/"/g, ""));
              }
            });
            return;
          }
          if (ts.isArrayTypeNode(inner)) {
            // keyof this would end up here — abstract models, skip
            return;
          }
        }

        // Strategy 2: initializer with `as const` (e.g. `= ["uuid"] as const`)
        const asExpr = valDecl.getChildren().find(c => ts.isAsExpression(c));
        if (asExpr && ts.isAsExpression(asExpr)) {
          const arrayExpr = asExpr.expression;
          if (ts.isArrayLiteralExpression(arrayExpr)) {
            arrayExpr.elements.forEach(el => {
              if (ts.isStringLiteral(el)) {
                module.models[name].PrimaryKey.push(el.text);
              }
            });
          }
        }
      }
    });
  }
}
