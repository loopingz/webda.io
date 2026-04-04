import * as ts from "typescript";
import type { WebdaModule } from "../definition.js";
import type { WebdaObjects } from "../module.js";
import { MetadataPlugin } from "./plugin.js";

export class CapabilitiesMetadata extends MetadataPlugin {
  getMetadata(module: WebdaModule, objects: WebdaObjects): void {
    const typeChecker = this.moduleGenerator.typeChecker;

    for (const section of ["moddas", "beans"] as const) {
      for (const name of Object.keys(objects[section])) {
        const searchResult = objects[section][name];
        const capabilities = this.extractCapabilities(searchResult.type, typeChecker);
        if (capabilities.length > 0) {
          module[section][name].capabilities = capabilities;
        }
      }
    }
  }

  private extractCapabilities(type: ts.Type, typeChecker: ts.TypeChecker): string[] {
    const capabilities: string[] = [];
    const declarations = type.symbol?.getDeclarations() || [];

    for (const decl of declarations) {
      if (!ts.isClassDeclaration(decl)) continue;

      for (const heritage of decl.heritageClauses || []) {
        for (const expr of heritage.types) {
          const interfaceType = typeChecker.getTypeAtLocation(expr);
          const interfaceDecls = interfaceType.symbol?.getDeclarations() || [];

          for (const interfaceDecl of interfaceDecls) {
            const capName = this.getCapabilityTag(interfaceDecl);
            if (capName && !capabilities.includes(capName)) {
              capabilities.push(capName);
            }
          }
        }
      }
    }

    return capabilities.sort();
  }

  private getCapabilityTag(node: ts.Declaration): string | undefined {
    const tags = ts.getAllJSDocTags(node, (tag): tag is ts.JSDocTag => true);
    for (const tag of tags) {
      if (tag.tagName.escapedText.toString() === "WebdaCapability") {
        return tag.comment?.toString().trim().split(" ").shift() || undefined;
      }
    }
    return undefined;
  }
}
