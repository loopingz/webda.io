//node.kind === ts.SyntaxKind.ClassDeclaration
import { DefaultSchemaResolver, Application, Service, CoreModel, AbstractDeployer, Logger } from "@webda/core";
import { JSONSchema6 } from "json-schema";
import * as ts from "typescript";
import * as TJS from "typescript-json-schema";
import * as path from "path";
import { unlinkSync, writeFileSync } from "fs";

export function programFromConfig(app: Application): ts.Program {
  const configFileName = app.getAppPath("tsconfig.json");
  // basically a copy of https://github.com/Microsoft/TypeScript/blob/3663d400270ccae8b69cbeeded8ffdc8fa12d7ad/src/compiler/tsc.ts -> parseConfigFile
  const result = ts.parseConfigFileTextToJson(configFileName, ts.sys.readFile(configFileName)!);
  const configObject = result.config;

  const configParseResult = ts.parseJsonConfigFileContent(
    configObject,
    ts.sys,
    path.dirname(configFileName),
    {},
    path.basename(configFileName)
  );
  const options = configParseResult.options;
  options.noEmit = true;
  delete options.out;
  delete options.outDir;
  delete options.outFile;
  delete options.declaration;
  delete options.declarationDir;
  delete options.declarationMap;
  const importer = app.getAppPath(".importer.ts");
  const module = app.getModules();
  let sources = [
    ...Object.values(module.services).filter(s => s.startsWith("./node_modules")),
    ...Object.values(module.deployers).filter(s => s.startsWith("./node_modules"))
  ];
  let content = ``;
  sources.forEach((src, i) => {
    content += `import * as i${i} from "${app.getAppPath(src.substr(2))}"\n`;
  });
  writeFileSync(importer, content);
  let program;
  try {
    configParseResult.fileNames.push(importer);
    program = ts.createProgram({
      rootNames: configParseResult.fileNames,
      options,
      projectReferences: configParseResult.projectReferences
    });
  } finally {
    unlinkSync(importer);
  }
  return program;
}

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
      let program = programFromConfig(this.app);
      // Inject all modules
      this.generator = TJS.buildGenerator(program, { required: true });
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
      if (
        // @ts-ignore
        (bases[i].getSymbol().valueDeclaration && bases[i].getSymbol().valueDeclaration.name.escapedText === name) ||
        this.extends(bases[i], name)
      ) {
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
        if (!param.symbol.declarations[0].constraint) {
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
