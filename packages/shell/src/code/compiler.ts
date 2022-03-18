//node.kind === ts.SyntaxKind.ClassDeclaration
import { Application, CachedModule, FileUtils, JSONUtils, Module, Section } from "@webda/core";
import * as ts from "typescript";
import * as path from "path";
import { existsSync } from "fs";
import { tsquery } from "@phenomnomnominal/tsquery";
import { SourceApplication } from "./sourceapplication";
import {
  createFormatter,
  createParser,
  FunctionType,
  SchemaGenerator,
  SubTypeFormatter,
  Definition,
  BaseType,
  ChainNodeParser,
  CircularReferenceNodeParser,
  AnnotatedNodeParser,
  ExtendedAnnotationsReader,
  Context,
  ObjectProperty,
  InterfaceAndClassNodeParser,
  ReferenceType,
  DefinitionType,
  Config,
  AnnotatedType
} from "ts-json-schema-generator";
import { isPublic, isStatic } from "ts-json-schema-generator/dist/src/Utils/modifiers";
import { JSONSchema7 } from "json-schema";
import { DeploymentManager } from "..";

class WebdaAnnotatedNodeParser extends AnnotatedNodeParser {
  createType(node: ts.Node, context: Context, reference?: ReferenceType) {
    let type = super.createType(node, context, reference);
    //console.log("createTypeKind", ts.SyntaxKind[node.parent.kind]);
    if (node.parent.kind === ts.SyntaxKind.PropertyDeclaration) {
      if ((<ts.PropertyDeclaration>node.parent).name.getText().startsWith("_")) {
        if (!(type instanceof AnnotatedType)) {
          type = new AnnotatedType(type, { readOnly: true }, false);
        } else {
          type.getAnnotations().readOnly = true;
        }
      }
    }
    return type;
  }
}

class WebdaModelNodeParser extends InterfaceAndClassNodeParser {
  public supportsNode(node: ts.InterfaceDeclaration | ts.ClassDeclaration): boolean {
    return (
      node.kind === ts.SyntaxKind.ClassDeclaration &&
      ts
        .getAllJSDocTags(node, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
          return true;
        })
        .map(n => n.tagName.escapedText.toString())
        .includes("WebdaModel")
    );
  }
  /*
  public createType(node: ts.ClassDeclaration, context: Context, reference?: ReferenceType): BaseType | undefined {
    const objectType = super.createType(node, context, reference);
    if (tsquery(node, "Decorator [name=Model]").length > 0) {
      return new DefinitionType(node.name.escapedText.toString(), objectType);
    }
    return objectType;
  }
 */

  /**
   * Override to filter __ properties
   * @param node
   * @param context
   * @returns
   */
  protected getProperties(
    node: ts.InterfaceDeclaration | ts.ClassDeclaration,
    context: Context
  ): ObjectProperty[] | undefined {
    let hasRequiredNever = false;

    const properties = (node.members as ts.NodeArray<ts.TypeElement | ts.ClassElement>)
      .reduce((members, member) => {
        if (ts.isConstructorDeclaration(member)) {
          const params = member.parameters.filter(param =>
            ts.isParameterPropertyDeclaration(param, param.parent)
          ) as ts.ParameterPropertyDeclaration[];
          members.push(...params);
        } else if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
          members.push(member);
        }
        return members;
      }, [] as (ts.PropertyDeclaration | ts.PropertySignature | ts.ParameterPropertyDeclaration)[])
      .filter(
        member =>
          isPublic(member) && !isStatic(member) && member.type && !this.getPropertyName(member.name).startsWith("__")
      )
      .map(member => {
        let memberObject = new ObjectProperty(
          this.getPropertyName(member.name),
          this.childNodeParser.createType(member.type!, context),
          !member.questionToken
        );
        return memberObject;
      })
      .filter(prop => {
        if (prop.isRequired() && prop.getType() === undefined) {
          hasRequiredNever = true;
        }
        return prop.getType() !== undefined;
      });

    if (hasRequiredNever) {
      return undefined;
    }

    return properties;
  }
}

const defaultCompilerHost = ts.createCompilerHost({});
let sourceFile = ``;

const customCompilerHost: ts.CompilerHost = {
  getSourceFile: (name, languageVersion) => {
    console.log(`getSourceFile ${name}`);

    if (name === "src/dynamic.importer.ts") {
      return ts.createSourceFile(name, sourceFile, ts.ScriptTarget.Latest);
    } else {
      return defaultCompilerHost.getSourceFile(name, languageVersion);
    }
  },
  writeFile: (filename, data) => {},
  getDefaultLibFileName: () => "lib.d.ts",
  useCaseSensitiveFileNames: () => false,
  getCanonicalFileName: filename => filename,
  getCurrentDirectory: () => "",
  getNewLine: () => "\n",
  getDirectories: () => [],
  fileExists: () => true,
  readFile: () => ""
};

export class MyFunctionTypeFormatter implements SubTypeFormatter {
  // You can skip this line if you don't need childTypeFormatter
  public constructor() {}

  public supportsType(type: FunctionType): boolean {
    //    console.log("MyCustomFormatter Type", type);
    return type instanceof FunctionType;
  }

  public getDefinition(type: FunctionType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "object",
      properties: {
        isFunction: {
          type: "boolean",
          const: true
        }
      }
    };
  }

  // If this type does NOT HAVE children, generally all you need is:
  public getChildren(type: FunctionType): BaseType[] {
    return [];
  }
}

export type SymbolRef = {
  name: string;
  typeName: string;
  fullyQualifiedName: string;
  symbol: ts.Symbol;
};

export class Compiler {
  symbols: SymbolRef[] = [];
  allSymbols: { [name: string]: ts.Type } = {};
  userSymbols: { [name: string]: ts.Symbol } = {};
  inheritingTypes: { [baseName: string]: string[] } = {};
  workingDir: string;
  sourceFile: ts.SourceFile;
  app: SourceApplication;

  types: {
    [key: string]: {
      library: boolean;
      type: ts.Type;
      extenders: Set<string>;
    };
  } = {};
  configParseResult: any;
  schemaGenerator: SchemaGenerator;
  typeChecker: ts.TypeChecker;

  /**
   * Construct a compiler for a WebdaApplication
   * @param app
   */
  constructor(app: SourceApplication) {
    this.app = app;
  }

  build(
    override: {
      compilerOptions?: ts.CompilerOptions;
      include?: string[];
      exclude?: string[];
      files?: string[];
      extends?: string;
    } = {},
    currentDir = process.cwd()
  ) {
    const configFile = ts.findConfigFile(currentDir, ts.sys.fileExists, "tsconfig.json");
    if (!configFile) throw Error("tsconfig.json not found");
    const { config } = ts.readConfigFile(configFile, ts.sys.readFile);

    config.compilerOptions = Object.assign({}, config.compilerOptions, override.compilerOptions);
    if (override.include) config.include = override.include;
    if (override.exclude) config.exclude = override.exclude;
    if (override.files) config.files = override.files;
    if (override.extends) config.files = override.extends;

    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(config, ts.sys, currentDir);

    const program = ts.createProgram({ options, rootNames: fileNames, configFileParsingDiagnostics: errors });

    const { diagnostics, emitSkipped } = program.emit();

    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(diagnostics, errors);

    if (allDiagnostics.length) {
      const formatHost: ts.FormatDiagnosticsHost = {
        getCanonicalFileName: path => path,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      const message = ts.formatDiagnostics(allDiagnostics, formatHost);
      console.warn(message);
    }

    if (emitSkipped) process.exit(1);
  }

  getProgramFromConfig(app: Application = this.app): ts.Program {
    const configFileName = app.getAppPath("tsconfig.json");
    // basically a copy of https://github.com/Microsoft/TypeScript/blob/3663d400270ccae8b69cbeeded8ffdc8fa12d7ad/src/compiler/tsc.ts -> parseConfigFile
    const result = ts.parseConfigFileTextToJson(configFileName, ts.sys.readFile(configFileName)!);
    const configObject = result.config;

    this.configParseResult = ts.parseJsonConfigFileContent(
      configObject,
      ts.sys,
      path.dirname(configFileName),
      {},
      path.basename(configFileName)
    );
    const options = this.configParseResult.options;
    /*
    options.noEmit = true;
    delete options.out;
    delete options.outDir;
    delete options.outFile;
    delete options.declaration;
    delete options.declarationDir;
    delete options.declarationMap;
    */
    const importer = app.getAppPath("src/dynamic.importer.ts");
    const module = app.getModules();

    let sources = [
      ...Object.values(module.moddas).filter(s => s.startsWith("./node_modules")),
      ...Object.values(module.deployers).filter(s => s.startsWith("./node_modules"))
    ];
    sourceFile = "";
    sources.forEach((src, i) => {
      sourceFile += `import * as i${i} from "${app.getAppPath(src.substr(2))}"\n`;
    });
    let program;

    this.configParseResult.fileNames.push(importer);
    program = ts.createProgram({
      rootNames: this.configParseResult.fileNames,
      options,
      projectReferences: this.configParseResult.projectReferences
    });
    return program;
  }

  getJSTargetFile(sourceFile: ts.SourceFile, absolutePath: boolean = false) {
    let filePath = ts.getOutputFileNames(this.configParseResult, sourceFile.fileName, true)[0];
    if (absolutePath) {
      return filePath;
    }
    return path.relative(this.app.getAppPath(), filePath);
  }

  getExportedName(node: ts.ClassDeclaration): string | undefined {
    let exportNodes = tsquery(node, "ExportKeyword");
    const className = node.name.escapedText.toString();
    if (exportNodes.length === 0) {
      // Try to find a generic export
      let namedExports = tsquery(this.getParent(node, ts.SyntaxKind.SourceFile), `ExportSpecifier [name=${className}]`);
      if (namedExports.length === 0) {
        return undefined;
      }
      // Return the export alias
      return (<ts.ExportSpecifier>namedExports.shift().parent).name.escapedText.toString();
    }
    if (tsquery(node, "DefaultKeyword").length) {
      return "default";
    }
    return className;
  }

  sortObject(unordered: any): any {
    return Object.keys(unordered)
      .sort()
      .reduce((obj, key) => {
        obj[key] = unordered[key];
        return obj;
      }, {});
  }

  /**
   * Generating the local module from source
   *
   * It scans for JSDoc @WebdaModda and @WebdaModel
   * to detect Modda and Model
   *
   * The @Bean and @Route Decorator will detect the Bean and ImplicitBean
   *
   * @param tsp
   * @returns
   */
  generateModule(tsp: ts.Program) {
    // Local module
    const module: Module = {
      moddas: {},
      beans: {},
      models: {},
      deployers: {},
      schemas: {}
    };
    this.typeChecker = tsp.getTypeChecker();
    // Generate the Module
    tsp.getSourceFiles().forEach(sourceFile => {
      if (!tsp.isSourceFileDefaultLibrary(sourceFile)) {
        this.sourceFile = sourceFile;
        this.inspect(sourceFile, tsp.getTypeChecker(), true);

        if (tsp.getRootFileNames().includes(sourceFile.fileName) && !sourceFile.fileName.endsWith(".spec.ts")) {
          const importTarget = this.getJSTargetFile(sourceFile).replace(/\.js$/, "");
          for (let node of tsquery(sourceFile, "ClassDeclaration")) {
            let clazz: ts.ClassDeclaration = <any>node;
            let tags = {};
            ts.getAllJSDocTags(clazz, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
              return true;
            }).forEach(n => {
              const tagName = n.tagName.escapedText.toString();
              if (tagName.startsWith("Webda")) {
                tags[tagName] = n.comment?.toString().trim().split(" ").shift() || clazz.name.escapedText;
              }
            });

            if (
              Object.keys(tags).includes("WebdaModel") ||
              Object.keys(tags).includes("WebdaModda") ||
              Object.keys(tags).includes("WebdaDeployer")
            ) {
              let exportName = this.getExportedName(clazz);
              if (!exportName) {
                this.app.log(
                  "WARN",
                  `WebdaObjects need to be exported ${clazz.name.escapedText} in ${sourceFile.fileName}`
                );
                continue;
              }
              const jsFile = `${importTarget}:${exportName}`;
              let section: Section;
              let schemaNode: ts.Node;
              const classTree = this.getClassTree(this.typeChecker.getTypeAtLocation(clazz));
              if (tags["WebdaModel"]) {
                section = "models";
                schemaNode = clazz;
              } else if (tags["WebdaModda"]) {
                // Skip as it does not inherite from Service
                if (!this.extends(classTree, "@webda/core", "Service")) {
                  this.app.log("WARN", `${jsFile} have a @WebdaModda annotation but does not inherite from Service`);
                  continue;
                }
                // Should not be able to fail - get the schemaNode for service parameters
                classTree.some(type => {
                  return (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).typeParameters?.some(t => {
                    let paramType = ts.getEffectiveConstraintOfTypeParameter(t);
                    if (
                      this.extends(
                        this.getClassTree(this.typeChecker.getTypeFromTypeNode(paramType)),
                        "@webda/core",
                        "ServiceParameters"
                      )
                    ) {
                      schemaNode = t.constraint;
                      return true;
                    }
                  });
                });
                section = "moddas";
              } else if (tags["WebdaDeployer"]) {
                section = "deployers";
                // DeployerResources
                // Skip as it does not inherite from Service
                if (!this.extends(classTree, "@webda/core", "AbstractDeployer")) {
                  this.app.log(
                    "WARN",
                    `${jsFile} have a @WebdaDeployer annotation but does not inherite from AbstractDeployer`
                  );
                  continue;
                }
                // Should not be able to fail - get the schemaNode for service parameters
                classTree.some(type => {
                  return (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).typeParameters?.some(t => {
                    // @ts-ignore
                    let paramType = ts.getEffectiveConstraintOfTypeParameter(t);
                    if (
                      this.extends(
                        this.getClassTree(this.typeChecker.getTypeFromTypeNode(paramType)),
                        "@webda/core",
                        "DeployerResources"
                      )
                    ) {
                      schemaNode = t.constraint;
                      return true;
                    }
                  });
                });
              }
              if (section) {
                let name = this.app.completeNamespace(
                  tags[`Webda${section.substr(0, 1).toUpperCase()}${section.substr(1, section.length - 2)}`]
                );
                module[section][name] = jsFile;
                if (!module.schemas[name] && schemaNode) {
                  module.schemas[name] = this.schemaGenerator.createSchemaFromNodes([schemaNode]);
                  module.schemas[name]["$ref"] = `#/definitions/${name.replace("/", ".")}`;
                }
              }
            }
          }
          // Detects Implicit Beans
          for (let route of tsquery(sourceFile, "Decorator [name=Route]")) {
            const clazz = <ts.ClassDeclaration>this.getParent(route, ts.SyntaxKind.ClassDeclaration);
            // Skip as it does not inherite from Service
            if (!this.extends(this.getClassTree(this.typeChecker.getTypeAtLocation(clazz)), "@webda/core", "Service")) {
              this.app.log("WARN", `${importTarget} have a @Route annotation but does not inherite from Service`);
              continue;
            }
            module.beans[`Beans/${clazz.name.escapedText}`.toLowerCase()] = importTarget;
          }

          // Detects Beans
          for (let bean of tsquery(sourceFile, "Decorator [name=Bean]")) {
            const clazz = <ts.ClassDeclaration>this.getParent(bean, ts.SyntaxKind.ClassDeclaration);
            // Skip as it does not inherite from Service
            if (!this.extends(this.getClassTree(this.typeChecker.getTypeAtLocation(clazz)), "@webda/core", "Service")) {
              this.app.log("WARN", `${importTarget} have a @Route annotation but does not inherite from Service`);
              continue;
            }
            module.beans[`Beans/${clazz.name.escapedText}`.toLowerCase()] = importTarget;
          }
        }
      }
    });
    module.beans = this.sortObject(module.beans);
    module.models = this.sortObject(module.models);
    module.moddas = this.sortObject(module.moddas);
    module.deployers = this.sortObject(module.deployers);
    return module;
  }

  getPackageFromType(type: ts.Type): string {
    const fileName = type.symbol.getDeclarations()[0]?.getSourceFile()?.fileName;
    if (!fileName) {
      return;
    }
    let folder = path.dirname(fileName);
    // if / or C:
    while (folder.length > 2) {
      const pkg = path.join(folder, "package.json");
      if (existsSync(pkg)) {
        return FileUtils.load(pkg).name;
      }
      folder = path.dirname(folder);
    }
    return undefined;
  }

  /**
   * Check if a type extends a certain subtype (packageName/symbolName)
   *
   * types can be obtained by using this.getClassTree(type: ts.Type)
   */
  extends(types: ts.Type[], packageName: string, symbolName: string) {
    for (const type of types) {
      if (type.symbol.name === symbolName && this.getPackageFromType(type) === packageName) {
        return true;
      }
    }
  }

  compile() {
    // https://convincedcoder.com/2019/01/19/Processing-TypeScript-using-TypeScript/

    this.app.log("INFO", "Compiling...");

    let tsp = this.getProgramFromConfig();
    const tc = tsp.getTypeChecker();

    // Emit all code
    let emits = tsp.emit();

    this.app.log("INFO", "Analyzing...");
    // Generate schemas
    const config: Config = {
      expose: "all",
      encodeRefs: true,
      jsDoc: "extended",
      additionalProperties: true,
      sortProps: true
    };
    const extraTags = new Set(["Modda", "Model"]);
    const parser = createParser(tsp, config, (chainNodeParser: ChainNodeParser) => {
      chainNodeParser.addNodeParser(
        new CircularReferenceNodeParser(
          new AnnotatedNodeParser(
            new WebdaModelNodeParser(
              tc,
              new WebdaAnnotatedNodeParser(chainNodeParser, new ExtendedAnnotationsReader(tc, extraTags)),
              true
            ),
            new ExtendedAnnotationsReader(tc, extraTags)
          )
        )
      );
    });
    const formatter = createFormatter(config, (fmt, circularReferenceTypeFormatter) => {
      // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
      fmt.addTypeFormatter(new MyFunctionTypeFormatter());
      //fmt.addTypeFormatter(new WebdaObjectPropertyFormatter(circularReferenceTypeFormatter));
    });
    this.schemaGenerator = new SchemaGenerator(tsp, parser, formatter, config);
    const module = this.generateModule(tsp);

    this.app.log("INFO", "Generating schemas...");
    console.log("Module", JSON.stringify(module, undefined, 2));
    //FileUtils.save(module, this.app.getAppPath("webda.module.json"));
  }

  /**
   * Generate the configuration schema
   *
   * @param filename to save for
   * @param full to keep all required
   */
  generateConfigurationSchema(
    filename: string = ".webda-config-schema.json",
    deploymentFilename: string = ".webda-deployment-schema.json",
    full: boolean = false
  ) {
    let res: JSONSchema7 = this.schemaGenerator.createSchema("Configuration");
    // Clean cached modules
    delete res.definitions.CachedModule;
    delete res.properties.cachedModules;
    // Add the definition for types
    res.definitions.ServicesType = {
      type: "string",
      enum: Object.keys(this.app.getModdas())
    };
    res.properties.services = {
      type: "object",
      additionalProperties: {
        oneOf: []
      }
    };
    Object.keys(this.app.getModdas()).forEach(serviceType => {
      const key = `ServiceType$${serviceType.replace(/\//g, "$")}`;
      const definition: JSONSchema7 = (res.definitions[key] = <JSONSchema7>this.app.getSchema(serviceType));
      if (!definition) {
        return;
      }
      (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
      (<JSONSchema7>(<JSONSchema7>res.properties.services).additionalProperties).oneOf.push({
        $ref: `#/definitions/${key}`
      });
      delete res.definitions[key]["$schema"];
      // Remove mandatory depending on option
      if (!full) {
        res.definitions[key]["required"] = ["type"];
      }
    });
    FileUtils.save(res, filename);
    // Build the deployment schema
    // Ensure builtin deployers are there
    DeploymentManager.addBuiltinDeployers(this.app);
    const definitions = JSONUtils.duplicate(res.definitions);
    res = {
      properties: {
        parameters: {
          type: "object",
          additionalProperties: true
        },
        resources: {
          type: "object",
          additionalProperties: true
        },
        services: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        units: {
          type: "array",
          items: { oneOf: [] }
        }
      },
      definitions: res.definitions
    };
    const appServices = this.app.getConfiguration().services;
    Object.keys(appServices).forEach(k => {
      if (!appServices[k]) {
        return;
      }
      const key = `Service$${k}`;
      (<JSONSchema7>res.properties.services).properties[k] = {
        type: "object",
        oneOf: [
          { $ref: `#/definitions/${key}` },
          ...Object.keys(definitions)
            .filter(name => name.startsWith("ServiceType"))
            .map(dkey => ({ $ref: `#/definitions/${dkey}` }))
        ]
      };
    });
    Object.keys(this.app.getDeployers()).forEach(serviceType => {
      const key = `DeployerType$${serviceType.replace(/\//g, "$")}`;
      const definition: JSONSchema7 = (res.definitions[key] = <JSONSchema7>this.app.getSchema(serviceType));
      if (!definition) {
        return;
      }
      if (!definition.properties) {
        definition.properties = {
          type: {
            type: "string"
          }
        };
      }
      (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
      (<JSONSchema7>(<JSONSchema7>res.properties.units).items).oneOf.push({ $ref: `#/definitions/${key}` });
      delete definition["$schema"];
      // Remove mandatory depending on option
      if (!full) {
        definition["required"] = ["type"];
      }
    });
  }

  /**
   * Generate regex based on a service name
   *
   * The regex will ensure the pattern is not case sensitive and
   * that the namespace is optional
   *
   * @param type
   * @returns
   */
  getServiceTypePattern(type: string): string {
    let result = "";
    type = this.app.completeNamespace(type).toLowerCase();
    for (let t of type) {
      if (t.match(/[a-z]/)) {
        result += `[${t}${t.toUpperCase()}]`;
      } else {
        result += t;
      }
    }
    // Namespace is optional
    let split = result.split("/");
    return `^(${split[0]}/)?${split[1]}$`;
  }

  /**
   * Retrieve a schema from a Modda
   * @param type
   */
  schemaFromModda(type: string) {}

  /**
   * Launch compiler in watch mode
   * @param callback
   */
  watch(callback: () => void) {
    // TODO Implement
  }

  displayItem(node: ts.Node, level: number = 0) {
    console.log(".".repeat(level), ts.SyntaxKind[node.kind], node.getText().split("\n")[0].substr(0, 60));
  }

  getParent(node: ts.Node, type: ts.SyntaxKind): ts.Node {
    let parent = node.parent;
    while (parent) {
      if (parent.kind === type) {
        return parent;
      }
      parent = parent.parent;
    }
    return undefined;
  }

  displayParents(node: ts.Node) {
    let parent = node.parent;
    let parents = [];
    while (parent !== undefined) {
      parents.unshift(parent);
      parent = parent.parent;
    }
    parents.forEach((p, ind) => {
      this.displayItem(p, ind);
    });
    this.displayItem(node, parents.length);
  }

  getClassTree(type: ts.Type): ts.Type[] {
    let res = [type];
    while (type.getBaseTypes()) {
      type = type.getBaseTypes()[0];
      if (!type || !type.symbol) {
        break;
      }
      // core/lib/services/service.d.ts
      if (type.symbol.valueDeclaration) {
        type = this.typeChecker.getTypeAtLocation(type.symbol.valueDeclaration);
        res.push(type);
      } else {
        break;
      }
    }
    return res;
  }

  displayTree(node: ts.Node, level: number = 0) {
    this.displayItem(node, level);
    ts.forEachChild(node, n => this.displayTree(n, level + 1));
  }

  getDecoratorName(node: ts.Decorator) {
    return (<ts.CallExpression>(<ts.Decorator>node).getChildren()[1]).expression.getText();
  }

  analyzeRoute(node: ts.MethodDeclaration) {
    let ctxName;
    let ctx: ts.Identifier;
    let block;
    ts.forEachChild(node, n => {
      if (n.kind === ts.SyntaxKind.Parameter && !ctxName) {
        ts.forEachChild(n, n => {
          if (n.kind === ts.SyntaxKind.Identifier) {
            ctx = <any>n;
          }
        });
        console.log("....", (<ts.ParameterDeclaration>n).name.getText());
      }
      if (n.kind === ts.SyntaxKind.Block && ctx) {
        console.log(".... SEARCH FOR", ctx.getText());
        //this.recursiveSearchForSymbol(n, ctx);
      }
    });
    //const ctxName = (<ts.ParameterDeclaration>childrens.filter(n => n.kind === ts.SyntaxKind.Parameter)[0]).name;
    // Search for any usage of context
    //console.log("Will search for any usage of context object", ctxName);
  }

  analyzeInject(node: ts.PropertyDeclaration) {}

  isUserFile(file: ts.SourceFile) {
    return !file.hasNoDefaultLib;
  }

  inspect(node: ts.Node, tc: ts.TypeChecker, deep: boolean = false, start: number = 0) {
    if (
      node.kind === ts.SyntaxKind.ClassDeclaration ||
      node.kind === ts.SyntaxKind.InterfaceDeclaration ||
      node.kind === ts.SyntaxKind.EnumDeclaration ||
      node.kind === ts.SyntaxKind.TypeAliasDeclaration
    ) {
      const symbol: ts.Symbol = (<any>node).symbol;
      const nodeType = tc.getTypeAtLocation(node);
      const fullyQualifiedName = tc.getFullyQualifiedName(symbol);
      const typeName = fullyQualifiedName.replace(/".*"\./, "");
      const name = typeName;
      this.types[fullyQualifiedName] = {
        library: !deep,
        type: nodeType,
        extenders: new Set<string>()
      };

      this.symbols.push({ name, typeName, fullyQualifiedName, symbol });
      if (!this.userSymbols[name]) {
        this.allSymbols[name] = nodeType;
      }

      if (this.isUserFile(this.sourceFile)) {
        this.userSymbols[name] = symbol;
      }

      const baseTypes = nodeType.getBaseTypes() || [];

      baseTypes.forEach(baseType => {
        var baseName = tc.typeToString(baseType, undefined, ts.TypeFormatFlags.UseFullyQualifiedType);
        if (!this.inheritingTypes[baseName]) {
          this.inheritingTypes[baseName] = [];
        }
        this.inheritingTypes[baseName].push(name);
        if (!this.types[baseName]) {
          //console.log(`\t${baseName}`);
          this.types[baseName] = {
            library: false,
            type: baseType,
            extenders: new Set<string>()
          };
        }
        this.types[baseName].extenders.add(fullyQualifiedName);
      });
      //ts.forEachChild(node, n => this.inspect(n, tc, deep, start + 1));
    } else {
      ts.forEachChild(node, n => this.inspect(n, tc, deep, start + 1));
    }
  }
}
