import * as ts from "typescript";
import type { WebdaModule } from "../definition.js";
import type { WebdaObjects } from "../module.js";
import { MetadataPlugin } from "./plugin.js";

/**
 * Compiler metadata plugin that detects `@WebdaCapability` JSDoc tags on interfaces
 * implemented by service classes, and writes the capability names into `webda.module.json`.
 *
 * During compilation, for each modda and bean, this plugin:
 * 1. Inspects the class declaration's heritage clauses (implements/extends)
 * 2. Resolves each implemented interface's type declarations
 * 3. Checks for `@WebdaCapability <name>` JSDoc tags
 * 4. Writes matching capability names as a sorted string array into the service metadata
 *
 * @example
 * Given an interface and service:
 * ```typescript
 * /** @WebdaCapability request-filter *​/
 * interface RequestFilter { checkRequest(...): Promise<boolean>; }
 *
 * /** @WebdaModda *​/
 * class HawkService extends Service implements RequestFilter { ... }
 * ```
 * The plugin writes `capabilities: ["request-filter"]` into HawkService's metadata.
 */
export class CapabilitiesMetadata extends MetadataPlugin {
  /**
   * Iterate over all moddas and beans, extract capabilities from their class
   * declarations, and write the results into the module metadata.
   *
   * @param module - The module definition being built; capabilities are written
   *   into `module[section][name].capabilities`
   * @param objects - Resolved service/bean objects containing TypeScript type
   *   information and AST nodes for each declared service
   */
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

  /**
   * Walk the heritage clauses of a class type and collect capability names
   * from any implemented interfaces that carry a `@WebdaCapability` JSDoc tag.
   *
   * @param type - The TypeScript type of the service class to inspect
   * @param typeChecker - The program's type checker, used to resolve interface types
   * @returns Sorted array of unique capability name strings; empty if none found
   */
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

  /**
   * Check whether a declaration node has a `@WebdaCapability` JSDoc tag and
   * return the capability name (the first word after the tag).
   *
   * @param node - A TypeScript declaration node (typically an interface declaration)
   * @returns The capability name string, or `undefined` if the tag is not present
   *   or has no text content
   */
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
