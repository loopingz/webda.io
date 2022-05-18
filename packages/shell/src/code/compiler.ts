//node.kind === ts.SyntaxKind.ClassDeclaration
import { Application, Logger, FileUtils, JSONUtils, Module, Section } from "@webda/core";
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
  Config,
  AnnotatedType,
  SubNodeParser,
  NodeParser,
  LogicError,
  ObjectType,
  LiteralType
} from "ts-json-schema-generator";
import { isPublic, isStatic } from "ts-json-schema-generator/dist/src/Utils/modifiers";
import { JSONSchema7 } from "json-schema";
/**
 * Temporary fix while waiting for https://github.com/vega/ts-json-schema-generator/pull/1182
 */
/* istanbul ignore next */
export class FunctionTypeFormatter implements SubTypeFormatter {
  public supportsType(type: FunctionType): boolean {
    return type instanceof FunctionType;
  }

  public getDefinition(_type: FunctionType): Definition {
    // Return a custom schema for the function property.
    return {};
  }

  public getChildren(_type: FunctionType): BaseType[] {
    return [];
  }
}
/* istanbul ignore next */
export function hash(a: unknown): string | number {
  if (typeof a === "number") {
    return a;
  }

  const str = typeof a === "string" ? a : JSON.stringify(a);

  // short strings can be used as hash directly, longer strings are hashed to reduce memory usage
  if (str.length < 20) {
    return str;
  }

  // from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    h = (h << 5) - h + char;
    h = h & h; // Convert to 32bit integer
  }

  // we only want positive integers
  if (h < 0) {
    return -h;
  }

  return h;
}
/* istanbul ignore next */
function getKey(node: ts.Node, context: Context): string {
  const ids: (number | string)[] = [];
  while (node) {
    const file = node
      .getSourceFile()
      .fileName.substring(process.cwd().length + 1)
      .replace(/\//g, "_");
    ids.push(hash(file), node.pos, node.end);

    node = node.parent;
  }
  const id = ids.join("-");

  const argumentIds = context.getArguments().map(arg => arg?.getId());

  return argumentIds.length ? `${id}<${argumentIds.join(",")}>` : id;
}

/**
 * Temporary fix
 */
/* istanbul ignore next */
class ConstructorNodeParser implements SubNodeParser {
  public supportsNode(node: ts.ConstructorTypeNode): boolean {
    return node.kind === ts.SyntaxKind.ConstructorType;
  }

  public createType(_node: ts.TypeQueryNode, _context: Context, _reference?: ReferenceType): BaseType | undefined {
    return undefined;
  }
}

/**
 * Temporary fix while waiting for https://github.com/vega/ts-json-schema-generator/pull/1183
 */
/* istanbul ignore next */
export class TypeofNodeParser implements SubNodeParser {
  public constructor(protected typeChecker: ts.TypeChecker, protected childNodeParser: NodeParser) {}

  public supportsNode(node: ts.TypeQueryNode): boolean {
    return node.kind === ts.SyntaxKind.TypeQuery;
  }

  public createType(node: ts.TypeQueryNode, context: Context, reference?: ReferenceType): BaseType | undefined {
    let symbol = this.typeChecker.getSymbolAtLocation(node.exprName)!;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.typeChecker.getAliasedSymbol(symbol);
    }

    const valueDec = symbol.valueDeclaration;
    if (ts.isEnumDeclaration(valueDec)) {
      return this.createObjectFromEnum(valueDec, context, reference);
    } else if (
      ts.isVariableDeclaration(valueDec) ||
      ts.isPropertySignature(valueDec) ||
      ts.isPropertyDeclaration(valueDec)
    ) {
      if (valueDec.type) {
        return this.childNodeParser.createType(valueDec.type, context);
      } else if (valueDec.initializer) {
        return this.childNodeParser.createType(valueDec.initializer, context);
      }
    } else if (ts.isClassDeclaration(valueDec)) {
      return this.childNodeParser.createType(valueDec, context);
    } else if (ts.isPropertyAssignment(valueDec)) {
      return this.childNodeParser.createType(valueDec.initializer, context);
    } else if (valueDec.kind === ts.SyntaxKind.FunctionDeclaration) {
      return;
    }

    throw new LogicError(`Invalid type query "${valueDec.getFullText()}" (ts.SyntaxKind = ${valueDec.kind})`);
  }

  protected createObjectFromEnum(node: ts.EnumDeclaration, context: Context, reference?: ReferenceType): ObjectType {
    const id = `typeof-enum-${getKey(node, context)}`;
    if (reference) {
      reference.setId(id);
      reference.setName(id);
    }

    let type: BaseType | null | undefined = null;
    const properties = node.members.map(member => {
      const name = member.name.getText();
      if (member.initializer) {
        type = this.childNodeParser.createType(member.initializer, context);
      } else if (type === null) {
        type = new LiteralType(0);
      } else if (type instanceof LiteralType && typeof type.getValue() === "number") {
        type = new LiteralType(+type.getValue() + 1);
      } else {
        throw new LogicError(`Enum initializer missing for "${name}"`);
      }
      return new ObjectProperty(name, type, true);
    });

    return new ObjectType(id, [], properties, false);
  }
}

class WebdaAnnotatedNodeParser extends AnnotatedNodeParser {
  createType(node: ts.Node, context: Context, reference?: ReferenceType) {
    let type = super.createType(node, context, reference);
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
    return node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.InterfaceDeclaration;
  }

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
        let type = this.childNodeParser.createType(member.type, context);
        // Check for other tags
        let ignore = false;
        let jsDocs = ts.getAllJSDocTags(member, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
          return true;
        });
        jsDocs.forEach(n => {
          if (n.tagName.text === "SchemaIgnore") {
            ignore = true;
          }
        });
        if (ignore) {
          return undefined;
        }
        let optional = jsDocs.filter(n => ["SchemaOptional", "readOnly"].includes(n.tagName.text)).length > 0;
        // If property is in readOnly then we do not want to require it
        return new ObjectProperty(
          this.getPropertyName(member.name),
          type,
          !member.questionToken && !optional && !this.getPropertyName(member.name).startsWith("_")
        );
      })
      .filter(prop => {
        if (!prop) {
          return false;
        }
        if (prop.isRequired() && prop.getType() === undefined) {
          /* istanbul ignore next */
          hasRequiredNever = true;
        }
        return prop.getType() !== undefined;
      });

    if (hasRequiredNever) {
      /* istanbul ignore next */
      return undefined;
    }

    return properties;
  }
}

export type SymbolRef = {
  name: string;
  typeName: string;
  fullyQualifiedName: string;
  symbol: ts.Symbol;
};

export class Compiler {
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
  compiled: boolean;
  tsProgram: ts.Program;
  watchProgram: ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram>;
  static watchOptions: ts.WatchOptions;

  /**
   * Construct a compiler for a WebdaApplication
   * @param app
   */
  constructor(app: SourceApplication) {
    this.app = app;
  }

  /**
   * Generate a program from app
   * @param app
   * @returns
   */
  createProgramFromApp(app: Application = this.app): void {
    const configFileName = app.getAppPath("tsconfig.json");
    // basically a copy of https://github.com/Microsoft/TypeScript/blob/3663d400270ccae8b69cbeeded8ffdc8fa12d7ad/src/compiler/tsc.ts -> parseConfigFile
    this.configParseResult = ts.parseJsonConfigFileContent(
      ts.parseConfigFileTextToJson(configFileName, ts.sys.readFile(configFileName)).config,
      ts.sys,
      path.dirname(configFileName),
      {},
      path.basename(configFileName)
    );
    this.tsProgram = ts.createProgram({
      rootNames: this.configParseResult.fileNames,
      ...this.configParseResult
    });
    this.typeChecker = this.tsProgram.getTypeChecker();
  }

  /**
   * Return the Javascript target file for a source
   * @param sourceFile
   * @param absolutePath
   * @returns
   */
  getJSTargetFile(sourceFile: ts.SourceFile, absolutePath: boolean = false) {
    let filePath = ts.getOutputFileNames(this.configParseResult, sourceFile.fileName, true)[0];
    if (absolutePath) {
      return filePath;
    }
    return path.relative(this.app.getAppPath(), filePath);
  }

  /**
   * Get the name of the export for a class
   *
   * Will also check if it is exported with a `export { MyClass }`
   *
   * @param node
   * @returns
   */
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

  /**
   * Sort object keys
   * @param unordered
   * @returns
   */
  sortObject(unordered: any): any {
    return Object.keys(unordered)
      .sort()
      .reduce((obj, key) => {
        obj[key] = unordered[key];
        return obj;
      }, {});
  }

  /**
   * Get a schema for a typed node
   * @param classTree
   * @param typeName
   * @param packageName
   * @returns
   */
  getSchemaNode(
    classTree: ts.Type[],
    typeName: string = "ServiceParameters",
    packageName: string = "@webda/core"
  ): ts.Node {
    let schemaNode;
    classTree.some(type => {
      let res = (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).heritageClauses?.some(t => {
        return t.types?.some(subtype => {
          return subtype.typeArguments?.some(arg => {
            if (this.extends(this.getClassTree(this.typeChecker.getTypeFromTypeNode(arg)), packageName, typeName)) {
              schemaNode = arg;
              return true;
            }
          });
        });
      });
      if (res) {
        return true;
      }
      return (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).typeParameters?.some(t => {
        // @ts-ignore
        let paramType = ts.getEffectiveConstraintOfTypeParameter(t);
        if (this.extends(this.getClassTree(this.typeChecker.getTypeFromTypeNode(paramType)), packageName, typeName)) {
          schemaNode = t.constraint;
          return true;
        }
      });
    });
    return schemaNode;
  }

  /**
   * Generating the local module from source
   *
   * It scans for JSDoc @WebdaModda and @WebdaModel
   * to detect Modda and Model
   *
   * The @Bean and @Route Decorator will detect the Bean and ImplicitBean
   *
   * @param this.tsProgram
   * @returns
   */
  generateModule() {
    // Ensure we have compiled the application
    this.compile();

    // Local module
    const moduleInfo: Module = {
      moddas: {},
      beans: {},
      models: {},
      deployers: {},
      schemas: {}
    };

    // Generate the Module
    this.tsProgram.getSourceFiles().forEach(sourceFile => {
      if (!this.tsProgram.isSourceFileDefaultLibrary(sourceFile)) {
        this.sourceFile = sourceFile;

        if (
          this.tsProgram.getRootFileNames().includes(sourceFile.fileName) &&
          !sourceFile.fileName.endsWith(".spec.ts")
        ) {
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
              } else if (tagName.startsWith("Schema")) {
                tags[tagName] = n.comment?.toString().trim() || "";
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
                // We do not generate schema for technical model like Context or SessionCookie
                if (this.extends(classTree, "@webda/core", "CoreModel")) {
                  schemaNode = clazz;
                }
              } else if (tags["WebdaModda"]) {
                // Skip as it does not inherite from Service
                if (!this.extends(classTree, "@webda/core", "Service")) {
                  this.app.log("WARN", `${jsFile} have a @WebdaModda annotation but does not inherite from Service`);
                  continue;
                }
                schemaNode = this.getSchemaNode(classTree);
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
                schemaNode = this.getSchemaNode(classTree, "DeployerResources");
              }
              if (section) {
                let originName =
                  tags[`Webda${section.substring(0, 1).toUpperCase()}${section.substring(1, section.length - 1)}`];
                let name = this.app.completeNamespace(originName);
                moduleInfo[section][name] = jsFile;
                if (!moduleInfo.schemas[name] && schemaNode) {
                  try {
                    let schema = this.schemaGenerator.createSchemaFromNodes([schemaNode]);
                    let definitionName = schema.$ref.split("/").pop();
                    moduleInfo.schemas[name] = <JSONSchema7>schema.definitions[definitionName];
                    moduleInfo.schemas[name].$schema = schema.$schema;
                    // Copy sub definition if needed
                    if (Object.keys(schema.definitions).length > 1) {
                      moduleInfo.schemas[name].definitions = schema.definitions;
                      // Avoid cycle ref
                      delete moduleInfo.schemas[name].definitions[definitionName];
                    }
                    moduleInfo.schemas[name].title = originName.split("/").pop();
                    if (section === "models" && tags["SchemaAdditionalProperties"]) {
                      moduleInfo.schemas[name].additionalProperties = {
                        description: tags["SchemaAdditionalProperties"]
                      };
                    }
                  } catch (err) {
                    this.app.log("WARN", `Cannot generate schema for ${schemaNode.getText()}`, err);
                  }
                }
              }
            }
          }

          const beanExplorer = bean => {
            const clazz = <ts.ClassDeclaration>this.getParent(bean, ts.SyntaxKind.ClassDeclaration);
            const classTree = this.getClassTree(this.typeChecker.getTypeAtLocation(clazz));
            // Skip as it does not inherite from Service
            if (!this.extends(classTree, "@webda/core", "Service")) {
              this.app.log(
                "WARN",
                `${importTarget} have a @Route or @Bean annotation but does not inherite from Service`
              );
              return;
            } // Skip explicit beans
            if (moduleInfo.beans[`Beans/${clazz.name.escapedText}`.toLowerCase()]) {
              return;
            }
            let name = `beans/${clazz.name.escapedText.toString().toLowerCase()}`;
            let schemaNode = this.getSchemaNode(classTree);
            if (schemaNode) {
              try {
                let schema = this.schemaGenerator.createSchemaFromNodes([schemaNode]);
                let definitionName = schema.$ref.split("/").pop();
                moduleInfo.schemas[name] = <JSONSchema7>schema.definitions[definitionName];
                moduleInfo.schemas[name].$schema = schema.$schema;
                // Copy sub definition if needed
                if (Object.keys(schema.definitions).length > 1) {
                  moduleInfo.schemas[name].definitions = schema.definitions;
                  // Avoid cycle ref
                  delete moduleInfo.schemas[name].definitions[definitionName];
                }
                moduleInfo.schemas[name].title = clazz.name.escapedText.toString();
              } catch (err) {
                this.app.log("WARN", `Cannot generate schema for ${schemaNode.getText()}`, err);
              }
            }
            moduleInfo.beans[`Beans/${clazz.name.escapedText}`.toLowerCase()] = importTarget;
          };

          tsquery(sourceFile, "Decorator [name=Bean]").forEach(beanExplorer);
          tsquery(sourceFile, "Decorator [name=Route]").forEach(beanExplorer);
        }
      }
    });

    moduleInfo.beans = this.sortObject(moduleInfo.beans);
    moduleInfo.models = this.sortObject(moduleInfo.models);
    moduleInfo.moddas = this.sortObject(moduleInfo.moddas);
    moduleInfo.deployers = this.sortObject(moduleInfo.deployers);
    return moduleInfo;
  }

  /**
   * Get the package name for a type
   * @param type
   * @returns
   */
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
      if (type.symbol?.name === symbolName && this.getPackageFromType(type) === packageName) {
        return true;
      }
    }
  }

  /**
   * Compile typescript
   */
  compile(force: boolean = false): boolean {
    if (this.compiled && !force) {
      return true;
    }
    let result = true;
    // https://convincedcoder.com/2019/01/19/Processing-TypeScript-using-TypeScript/

    this.app.log("INFO", "Compiling...");

    this.createProgramFromApp();

    // Emit all code
    const { diagnostics } = this.tsProgram.emit();

    const allDiagnostics = ts.getPreEmitDiagnostics(this.tsProgram).concat(diagnostics, this.configParseResult.errors);

    if (allDiagnostics.length) {
      const formatHost: ts.FormatDiagnosticsHost = {
        getCanonicalFileName: p => p,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      const message = ts.formatDiagnostics(allDiagnostics, formatHost);
      this.app.log("WARN", message);
      result = false;
    }

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
    const parser = createParser(this.tsProgram, config, (chainNodeParser: ChainNodeParser) => {
      chainNodeParser.addNodeParser(new ConstructorNodeParser());
      chainNodeParser.addNodeParser(new TypeofNodeParser(this.typeChecker, chainNodeParser));
      chainNodeParser.addNodeParser(
        new CircularReferenceNodeParser(
          new AnnotatedNodeParser(
            new WebdaModelNodeParser(
              this.typeChecker,
              new WebdaAnnotatedNodeParser(chainNodeParser, new ExtendedAnnotationsReader(this.typeChecker, extraTags)),
              true
            ),
            new ExtendedAnnotationsReader(this.typeChecker, extraTags)
          )
        )
      );
    });
    const formatter = createFormatter(config, (fmt, _circularReferenceTypeFormatter) => {
      // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
      fmt.addTypeFormatter(new FunctionTypeFormatter());
    });
    this.schemaGenerator = new SchemaGenerator(this.tsProgram, parser, formatter, config);
    this.compiled = result;
    return result;
  }

  /**
   * Generate the configuration schema
   *
   * @param filename to save for
   * @param full to keep all required
   */
  generateConfigurationSchemas(
    filename: string = ".webda-config-schema.json",
    deploymentFilename: string = ".webda-deployment-schema.json",
    full: boolean = false
  ) {
    // Ensure we have compiled already
    this.compile();

    let rawSchema: JSONSchema7 = this.schemaGenerator.createSchema("UnpackedConfiguration");
    let res: JSONSchema7 = <JSONSchema7>rawSchema.definitions["UnpackedConfiguration"];
    res.definitions ??= {};
    // Add the definition for types
    res.definitions.ServicesType = {
      type: "string",
      enum: Object.keys(this.app.getModdas() || {})
    };
    res.properties.services = {
      type: "object",
      additionalProperties: {
        oneOf: []
      }
    };
    const addServiceSchema = (type: "ServiceType" | "BeanType") => {
      return serviceType => {
        const key = `${type}$${serviceType.replace(/\//g, "$")}`;
        const definition: JSONSchema7 = (res.definitions[key] = this.app.getSchema(serviceType));
        if (!definition) {
          return;
        }
        definition.title ??= serviceType;
        (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
        (<JSONSchema7>(<JSONSchema7>res.properties.services).additionalProperties).oneOf.push({
          $ref: `#/definitions/${key}`
        });
        delete res.definitions[key]["$schema"];
        // Flatten definition (might not be the best idea)
        for (let def in definition.definitions) {
          res.definitions[def] ??= definition.definitions[def];
        }
        delete definition.definitions;
        // Remove mandatory depending on option
        if (!full) {
          res.definitions[key]["required"] = ["type"];
        }
        // Predefine beans
        if (type === "BeanType") {
          (<JSONSchema7>res.properties.services).properties ??= {};
          res.properties.services[definition.title] = {
            $ref: `#/definitions/${key}`
          };
          (<JSONSchema7>res.definitions[key]).required ??= [];
          (<JSONSchema7>res.definitions[key]).required = (<JSONSchema7>res.definitions[key]).required.filter(
            p => p !== "type"
          );
        }
      };
    };
    Object.keys(this.app.getModdas()).forEach(addServiceSchema("ServiceType"));
    Object.keys(this.app.getBeans()).forEach(addServiceSchema("BeanType"));
    FileUtils.save(res, filename);
    // Build the deployment schema
    // Ensure builtin deployers are there
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
      const definition: JSONSchema7 = (res.definitions[key] = this.app.getSchema(serviceType));
      if (!definition) {
        return;
      }
      definition.title = serviceType;
      (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
      (<JSONSchema7>(<JSONSchema7>res.properties.units).items).oneOf.push({ $ref: `#/definitions/${key}` });
      delete definition["$schema"];
      // Remove mandatory depending on option
      if (!full) {
        definition["required"] = ["type"];
      }
    });
    FileUtils.save(res, deploymentFilename);
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
    type = this.app.completeNamespace(type);
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
  getSchema(type: string) {
    this.compile();
    return this.schemaGenerator.createSchema(type);
  }

  /**
   * Launch compiler in watch mode
   * @param callback
   */
  watch(callback: (diagnostic: ts.Diagnostic) => void, logger: Logger) {
    const formatHost: ts.FormatDiagnosticsHost = {
      // This method is not easily reachable and is straightforward
      getCanonicalFileName: /* istanbul ignore next */ p => p,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine
    };
    const reportDiagnostic = (diagnostic: ts.Diagnostic) => {
      callback(diagnostic);
      logger.log(
        "WARN",
        diagnostic.code,
        ":",
        ts.flattenDiagnosticMessageText(diagnostic.messageText, formatHost.getNewLine())
      );
    };
    const reportWatchStatusChanged = (diagnostic: ts.Diagnostic) => {
      if ([6031, 6032, 6194, 6193].includes(diagnostic.code)) {
        logger.log("INFO", diagnostic.messageText);
        // Launching compile
        if (diagnostic.code === 6032 || diagnostic.code === 6031) {
          logger.logTitle("Compiling");
        } else {
          if (diagnostic.messageText.toString().startsWith("Found 0 errors")) {
            logger.logTitle("Generating module");
            this.compiled = false;
            this.app.generateModule();
          }
        }
      } else {
        // Haven't seen other code yet so display them but cannot reproduce
        /* istanbul ignore next */
        logger.log("INFO", diagnostic, ts.formatDiagnostic(diagnostic, formatHost));
      }
      callback(diagnostic);
    };
    const host = ts.createWatchCompilerHost(
      this.app.getAppPath("tsconfig.json"),
      {},
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reportDiagnostic,
      reportWatchStatusChanged,
      Compiler.watchOptions
    );
    this.watchProgram = ts.createWatchProgram(host);
  }

  /**
   * Stop watching for change on typescript
   */
  stopWatch() {
    this.watchProgram?.close();
    this.watchProgram = undefined;
  }

  /**
   * Get the class hierarchy
   * @param type
   * @returns
   */
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

  /********************* DEVELOPMENT UTILS ****************/

  /**
   * Utils to display a tree in console
   *
   * Useful during development
   * @param node
   * @param level
   */
  displayTree(node: ts.Node, level: number = 0) {
    this.displayItem(node, level);
    ts.forEachChild(node, n => this.displayTree(n, level + 1));
  }

  /**
   * Display an item
   * @param node
   * @param level
   */
  displayItem(node: ts.Node, level: number = 0) {
    console.log(".".repeat(level), ts.SyntaxKind[node.kind], node.getText().split("\n")[0].substring(0, 60));
  }

  /**
   * Get a parent of a certain Type
   * @param node
   * @param type
   * @returns
   */
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

  /**
   * Display all parent of a Node
   * @param node
   */
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
}
