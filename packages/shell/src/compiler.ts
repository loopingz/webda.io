//node.kind === ts.SyntaxKind.ClassDeclaration
import { DefaultSchemaResolver, Application, Service, CoreModel, AbstractDeployer, Logger } from "@webda/core";
import { JSONSchema6 } from "json-schema";
import * as ts from "typescript";
import * as TJS from "typescript-json-schema";

/**
 * Use Typescript compiler to generate schemas
 */
export class TypescriptSchemaResolver extends DefaultSchemaResolver {
  /**
   * TJS Generator
   */
  generator: TJS.JsonSchemaGenerator;
  /**
   * All known symbols
   */
  symbols: { [name: string]: ts.Type };
  logger: Logger;

  constructor(app: Application, logger: Logger) {
    super(app);
    this.logger = logger;
    if (this.app.isTypescript()) {
      this.generator = TJS.buildGenerator(TJS.programFromConfig(app.getAppPath("tsconfig.json")), { required: true });
      // @ts-ignore
      this.symbols = this.generator.allSymbols;
    } else {
      this.logger.log("TRACE", "Application is not typescript can not guess schemas");
    }
  }

  /**
   * Ask the generator directly to check class
   * 
   * @param type of symbol
   * @returns 
   */
  fromSymbol(type: string): JSONSchema6 {
    // @ts-ignore
    return this.generator.getSchemaForSymbol(type);
  }

  /**
   * Update from prototype to introspect Typescript if no schema is declared
   *
   * @param type
   */
  fromPrototype(type: any): JSONSchema6 {
    let res = super.fromPrototype(type);
    if (res === undefined && this.app.isTypescript()) {
      this.logger.log("TRACE", "Generate schema dynamically for", type.name);
      if (this.app.extends(type, Service)) {
        res = this.findParameters(type.name, "ServiceParameters");
      } else if (this.app.extends(type, CoreModel)) {
        try {
          // @ts-ignore
          res = this.generator.getSchemaForSymbol(type.name);
        } catch (error) {
          this.logger.log("WARN", "Cannot generate schema for CoreModel", type.name, error.message);
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
    let symbol: any = this.symbols[serviceName];
    if (!symbol) {
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
      let found = this.findParameters(baseTypes[i], parameterClass);
      if (found) {
        return found;
      }
    }
  }
}
