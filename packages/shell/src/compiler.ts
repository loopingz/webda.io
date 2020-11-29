//node.kind === ts.SyntaxKind.ClassDeclaration
import { DefaultSchemaResolver, Application, Service, CoreModel, AbstractDeployer } from "@webda/core";
import { JSONSchema6 } from "json-schema";
import * as ts from "typescript";
import * as TJS from "typescript-json-schema";
import { existsSync } from "fs";

/**
 * Use Typescript compiler to generate schemas
 */
export class TypescriptSchemaResolver extends DefaultSchemaResolver {
  enabled: boolean;
  generator: TJS.JsonSchemaGenerator;
  symbols: { [name: string]: ts.Type };

  constructor(app: Application) {
    super(app);
    this.enabled = existsSync(app.getAppPath("tsconfig.json"));
    if (this.enabled) {
      this.generator = TJS.buildGenerator(TJS.programFromConfig(app.getAppPath("tsconfig.json")), { required: true });
      // @ts-ignore
      this.symbols = this.generator.allSymbols;
    }
  }

  /**
   * Update from prototype to introspect Typescript if no schema is declared
   *
   * @param type
   */
  fromPrototype(type: any): JSONSchema6 {
    let res = super.fromPrototype(type);
    if (res === undefined && this.enabled) {
      // @ts-ignore
      this.generator.reffedDefinitions = {};
      if (this.app.extends(type, Service)) {
        res = this.findParameters(type.name, "ServiceParameters");
      } else if (this.app.extends(type, CoreModel)) {
        console.log("Generate schema for", type.name, this.symbols[type.name] !== undefined);
        try {
          // @ts-ignore
          res = this.generator.getSchemaForSymbol(type.name, false);
        } catch (error) {
          console.log("Cannot generate schema for", type.name, error.message);
        }
      } else if (this.app.extends(type, AbstractDeployer)) {
        res = this.findParameters(type.name, "DeployerResources");
      }
    }
    return res;
  }

  /**
   * Check if symbol extends a specific class name
   * @param symbol
   * @param name
   */
  extends(symbol: ts.Type, name: string): boolean {
    if (symbol.symbol.escapedName === name) {
      return true;
    }
    let bases = symbol.getBaseTypes();
    for (let i in bases) {
      // @ts-ignore
      if (bases[i].getSymbol().valueDeclaration.name.escapedText === name || this.extends(bases[i], name)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find class parameters to deduct the json schema
   *
   * @param serviceName
   * @param parameterClass
   */
  findParameters(serviceName: string, parameterClass: string) {
    console.log(`Searching for '${serviceName}' '${parameterClass}'`);
    let symbol: any = this.symbols[serviceName];
    if (!symbol) {
      console.log("Not found");
      return undefined;
    }
    if (symbol.typeParameters) {
      let found;
      symbol.typeParameters.forEach(param => {
        if (found) {
          return;
        }
        found = param.symbol.declarations[0].constraint.typeName.escapedText;
        if (this.symbols[found] && this.extends(this.symbols[found], parameterClass)) {
          console.log(
            "FOUND PARAMETER",
            param.symbol.escapedName,
            param.symbol.declarations[0].constraint.typeName.escapedText
          );
          return;
        }
        found = undefined;
      });
      if (found) {
        return this.generator.getSchemaForSymbol(found);
      }
    }
    let baseTypes = symbol.getBaseTypes().map(i => i.getSymbol().valueDeclaration.name.escapedText);
    for (let i in baseTypes) {
      console.log("-> check extends", baseTypes[i]);
      let found = this.findParameters(baseTypes[i], parameterClass);
      if (found) {
        return found;
      }
    }
  }
}
