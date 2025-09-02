import ts from "typescript";
import { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";
import { Module } from "module";

/**
 * Primary key metadata plugin
 */
export class PrimaryKeyMetadata extends MetadataPlugin {
  getMetadata(module: any, objects: WebdaObjects): void {
    Object.keys(objects.models).forEach(name => {
      const { type } = objects.models[name];
      const primarySymbol = type
        .getProperties()
        .find(p => this.moduleGenerator.propertyIsKeyedBySymbol(p, "@webda/models", "WEBDA_PRIMARY_KEY"));
      if (primarySymbol) {
        module.models[name].PrimaryKey ??= [];
        const node = primarySymbol.valueDeclaration.getChildren().find(c => ts.isTypeOperatorNode(c));
        if (node.operator === ts.SyntaxKind.ReadonlyKeyword) {
          const inner = node.type;
          if (ts.isArrayTypeNode(inner)) {
            // keyof this would end up here, but that are abstract models
          } else if (ts.isTupleTypeNode(inner)) {
            inner.elements.forEach((element) => {
              if (ts.isLiteralTypeNode(element)) {
                module.models[name].PrimaryKey.push(element.literal.getText().replace(/"/g, ""));
              }
            });
          }
        }
      }
    });
  }
}
