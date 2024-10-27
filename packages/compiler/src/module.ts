import * as ts from "typescript";
import { Compiler } from "./compiler";
import { useLog } from "@webda/workout";
import { JSONSchema7 } from "json-schema";
import { getTagsName, getParent, isSymbolMapper, SymbolMapper, getTypeIdFromTypeNode } from "./utils";
import { existsSync, readFileSync } from "node:fs";
import { FileUtils, JSONUtils } from "@webda/utils";
import { tsquery } from "@phenomnomnominal/tsquery";
import { dirname, join, relative } from "path";
import { SchemaGenerator } from "ts-json-schema-generator";
import { ModelGraphBinaryDefinition, ModelMetadata, ModelRelation, WebdaModule } from "./definition";
import { createSchemaGenerator } from "./schemaparser";

type ReplaceModelWith<T, L> = T extends object
  ? { [K in keyof T]: K extends "model" ? L : ReplaceModelWith<T[K], L> }
  : T;

/**
 * With compiled program, analyze the program and generate module
 *
 */
export class ModuleGenerator {
  typeChecker: ts.TypeChecker;
  schemaGenerator: SchemaGenerator;
  constructor(protected compiler: Compiler) {}

  /**
   * Generate a single schema
   * @param schemaNode
   */
  generateSchema(schemaNode: ts.Node, title?: string) {
    let res;
    try {
      useLog("INFO", "Generating schema for " + title);
      const schema = this.schemaGenerator.createSchemaFromNodes([schemaNode]);
      const definitionName = decodeURI(schema.$ref.split("/").pop());
      res = <JSONSchema7>schema.definitions[definitionName];
      res.$schema = schema.$schema;
      // Copy sub definition if needed
      if (Object.keys(schema.definitions).length > 1) {
        res.definitions = schema.definitions;
        // Avoid cycle ref
        delete res.definitions[definitionName];
      }
      if (title) {
        res.title = title;
      }
    } catch (err) {
      useLog("WARN", `Cannot generate schema for ${schemaNode.getText()}`, err);
    }
    return res;
  }

  /**
   * Get the class hierarchy
   * @param type
   * @returns
   */
  getClassTree(type: ts.Type): ts.Type[] {
    const res = [type];
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
    return false;
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
    let folder = dirname(fileName);
    // if / or C:
    while (folder.length > 2) {
      const pkg = join(folder, "package.json");
      if (existsSync(pkg)) {
        return FileUtils.load(pkg).name;
      }
      folder = dirname(folder);
    }
    return undefined;
  }

  /**
   * Get a schema for a typed node
   *
   * Our Service have a generic type ServiceParameters
   * This method will return the schema node for this type
   *
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
      const res = (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).heritageClauses?.some(t => {
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
        const paramType = ts.getEffectiveConstraintOfTypeParameter(t);
        if (this.extends(this.getClassTree(this.typeChecker.getTypeFromTypeNode(paramType)), packageName, typeName)) {
          schemaNode = t.constraint;
          return true;
        }
      });
    });
    return schemaNode;
  }

  /**
   * Get the name of the export for a class
   *
   * Will also check if it is exported with a `export { MyClass }`
   *
   * @param node
   * @returns
   */
  getExportedName(node: ts.ClassDeclaration | ts.InterfaceDeclaration): string | undefined {
    const exportNodes = tsquery(node, "ExportKeyword");
    const className = node.name.escapedText.toString();
    if (exportNodes.length === 0) {
      // Try to find a generic export
      const namedExports = tsquery(getParent(node, ts.SyntaxKind.SourceFile), `ExportSpecifier [name=${className}]`);
      if (namedExports.length === 0) {
        return undefined;
      }
      // Return the export alias
      const alias = <ts.ExportSpecifier>namedExports.shift().parent;

      if (ts.isIdentifier(alias.name)) {
        return alias.name.escapedText.toString();
      } else {
        return alias.name.getText();
      }
    }
    if (tsquery(node, "DefaultKeyword").length) {
      return "default";
    }
    return className;
  }

  /**
   * Get a model name from a library path based on file and classname
   * @param fileName
   * @param className
   * @returns
   */
  getLibraryModelName(fileName: string, className: string) {
    let mod = dirname(fileName);
    let moduleInfo;
    while (mod !== "/") {
      if (existsSync(join(mod, "webda.module.json"))) {
        moduleInfo = JSON.parse(readFileSync(join(mod, "webda.module.json")).toString());
        break;
      }
      mod = dirname(mod);
    }
    // Should not happen
    /* c8 ignore next 3 */
    if (!moduleInfo) {
      return;
    }
    const importEntry = `${relative(mod, fileName.replace(/\.d\.ts$/, ""))}:${className}`;
    return Object.keys(moduleInfo.models.list || {}).find(f => moduleInfo.models.list[f] === importEntry);
  }

  /**
   * Retrieve all webda  objects from source
   *
   * If an object have a @WebdaIgnore tag, it will be ignored
   * Every CoreModel object will be added if it is exported and not abstract
   * @returns
   */
  searchForWebdaObjects() {
    const result: {
      schemas: WebdaSchemaResults;
      models: WebdaSearchResults;
      moddas: WebdaSearchResults;
      deployers: WebdaSearchResults;
      beans: WebdaSearchResults;
    } = {
      schemas: new WebdaSchemaResults(),
      models: {},
      moddas: {},
      deployers: {},
      beans: {}
    };
    const program = this.compiler.tsProgram;
    program.getSourceFiles().forEach(sourceFile => {
      if (
        !program.isSourceFileDefaultLibrary(sourceFile) &&
        //this.tsProgram.getRootFileNames().includes(sourceFile.fileName) &&
        !sourceFile.fileName.endsWith(".spec.ts")
      ) {
        ts.forEachChild(sourceFile, (node: ts.Node) => {
          // Skip everything except class and interface\
          // Might want to allow type for schema
          const tags = getTagsName(node);
          const type = this.typeChecker.getTypeAtLocation(node);
          // Manage schemas
          if (tags["WebdaSchema"]) {
            const name = this.compiler.project.completeNamespace(
              tags["WebdaSchema"] || (<ts.ClassDeclaration>node).name?.escapedText.toString()
            );
            result.schemas.add(name, node, (<ts.ClassDeclaration>node).name?.escapedText.toString(), false, "schemas");
            return;
            // Only Schema work with other than class declaration
          } else if (!ts.isClassDeclaration(node)) {
            return;
          }
          const classNode: ts.ClassDeclaration = <ts.ClassDeclaration>node;
          const symbol = this.typeChecker.getSymbolAtLocation(classNode.name);

          // Explicit ignore this class
          if (tags["WebdaIgnore"]) {
            return;
          }
          const classTree = this.getClassTree(type);
          if (!program.getRootFileNames().includes(sourceFile.fileName)) {
            if (this.extends(classTree, "@webda/core", "CoreModel")) {
              const name = this.getLibraryModelName(sourceFile.fileName, this.getExportedName(classNode));
              // This should not happen likely bad module not worth checking
              /* c8 ignore next 3 */
              if (!name) {
                return;
              }
              // @ts-ignore
              result["models"][name] = {
                name,
                tags: {},
                lib: true,
                type,
                node,
                symbol,
                jsFile: sourceFile.fileName.replace(/\.d\.ts$/, ".js")
              };
            }
            return;
          }
          const importTarget = this.getJSTargetFile(sourceFile).replace(/\.js$/, "");

          let section;
          let schemaNode;
          if (this.extends(classTree, "@webda/core", "CoreModel")) {
            section = "models";
            schemaNode = node;
          } else if (tags["WebdaModda"]) {
            if (!this.extends(classTree, "@webda/core", "Service")) {
              useLog(
                "WARN",
                `${importTarget}(${classNode.name?.escapedText}) have a @WebdaModda annotation but does not inherite from Service`
              );
              return;
            }
            section = "moddas";
            schemaNode = this.getSchemaNode(classTree);
          } else if (tags["WebdaDeployer"]) {
            if (!this.extends(classTree, "@webda/core", "AbstractDeployer")) {
              useLog(
                "WARN",
                `${importTarget}(${classNode.name?.escapedText}) have a @WebdaDeployer annotation but does not inherite from AbstractDeployer`
              );
              return;
            }
            section = "deployers";
            schemaNode = this.getSchemaNode(classTree, "DeployerResources");
          } else if (this.extends(classTree, "@webda/core", "Service")) {
            // Check if a Bean is declared
            if (!ts.getDecorators(classNode)?.find(decorator => decorator.expression.getText() === "Bean")) {
              return;
            }
            section = "beans";
            schemaNode = this.getSchemaNode(classTree);
          } else {
            return;
          }
          const exportName = this.getExportedName(classNode);
          if (!exportName) {
            useLog("WARN", `WebdaObjects need to be exported ${classNode.name.escapedText} in ${sourceFile.fileName}`);
            return;
          }
          const info: WebdaSearchResult = {
            type,
            symbol,
            node,
            tags,
            lib: false,
            jsFile: `${importTarget}:${exportName}`,
            name: this.compiler.project.completeNamespace(
              tags[`Webda${section.substring(0, 1).toUpperCase()}${section.substring(1, section.length - 1)}`] ||
                classNode.name.escapedText
            )
          };
          if (schemaNode && !result["schemas"][info.name]) {
            result["schemas"].add(
              info.name,
              schemaNode,
              classNode.name?.escapedText.toString(),
              section === "beans" || section === "moddas",
              section
            );
          }
          result[section][info.name] = info;
        });
      }
    });
    return result;
  }

  /**
   * Return the Javascript target file for a source
   * @param sourceFile
   * @param absolutePath
   * @returns
   */
  getJSTargetFile(sourceFile: ts.SourceFile, absolutePath: boolean = false) {
    const filePath = ts.getOutputFileNames(this.compiler.configParseResult, sourceFile.fileName, true)[0];
    if (absolutePath) {
      return filePath;
    }
    return relative(this.compiler.project.getAppPath(), filePath);
  }

  getTypeParameterResolution(node: ts.TypeReferenceNode): string | undefined {
    const checker = this.typeChecker;
    const type = checker.getTypeAtLocation(node);
    const symbol = type.aliasSymbol || type.symbol;

    if (symbol && symbol.declarations) {
      for (const declaration of symbol.declarations) {
        // Check if the declaration is a type alias or interface
        if (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
          const typeParameters = declaration.typeParameters;
          if (typeParameters) {
            // Find the corresponding type parameter
            const typeParameter = typeParameters.find(param => param.name.text === node.typeName.getText());
            if (typeParameter) {
              // Get the constraint of the type parameter
              const constraint = typeParameter.constraint;
              if (constraint) {
                // Resolve the constraint to a user-friendly string
                return checker.typeToString(checker.getTypeAtLocation(constraint));
              }
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Generate the graph relationship between models
   * And the hierarchy tree
   * @param models
   */
  processModels(models: WebdaSearchResults): WebdaModule["models"] {
    const modelsMetadata: WebdaModule["models"] = {};
    const symbolMap = new Map<number, string>();
    const list = {};
    Object.values(models).forEach(({ name, type, tags, lib, jsFile }) => {
      // @ts-ignore
      symbolMap.set(type.id, name);
      // Do not process external models apart from adding them to the symbol map
      if (lib) {
        return;
      }
      const metadata = {
        Plural: tags["WebdaPlural"] || name.split("/").pop() + "s",
        Import: jsFile,
        Relations: {},
        Ancestors: [],
        Subclasses: [],
        Reflection: {},
        Schema: {}
      };

      // Retrieve declare link in the model
      type
        .getProperties()
        .filter(p => ts.isPropertyDeclaration(p.valueDeclaration))
        .forEach((prop: Omit<ts.Symbol, "valueDeclaration"> & { valueDeclaration: ts.PropertyDeclaration }) => {
          // Skip the non enumerable properties
          if (
            (ts.getDecorators(<ts.PropertyDeclaration>prop.valueDeclaration) || []).find(annotation => {
              return "NotEnumerable" === annotation?.expression?.getText();
            }) ||
            prop.getJsDocTags().find(p => p.name === "ignore") !== undefined
          ) {
            return;
          }

          const pType: ts.TypeReferenceNode = <ts.TypeReferenceNode>prop.valueDeclaration
            .getChildren()
            .filter(c => c.kind === ts.SyntaxKind.TypeReference)
            .shift();

          const children = prop.valueDeclaration.getChildren();
          let type;
          let captureNext = false;
          for (const i in children) {
            if (captureNext) {
              type = children[i];
            }
            captureNext = children[i].kind === ts.SyntaxKind.ColonToken;
          }

          // Reflection of the attributes
          if (pType) {
            if (pType.typeArguments?.length) {
              metadata.Reflection[prop.getName()] = {
                type: pType.typeName.getText()
              };
              metadata.Reflection[prop.getName()].typeParameters = pType.typeArguments.map(t => {
                const typeParameter = this.typeChecker.getTypeAtLocation(t);
                // Check if the type parameter has a constraint
                const constraint = typeParameter.getConstraint();
                if (constraint) {
                  return this.typeChecker.typeToString(constraint); // Use the constraint type
                } else {
                  return this.typeChecker.typeToString(typeParameter); // Fallback to original type
                }
              });
            } else {
              metadata.Reflection[prop.getName()] = {
                type: pType.getText()
              };
            }
          } else if (type) {
            if (type.getText().endsWith("[]")) {
              metadata.Reflection[prop.getName()] = {
                type: "Array",
                typeParameters: [type.getText().substring(0, type.getText().length - 2)]
              };
            } else {
              metadata.Reflection[prop.getName()] = {
                type: type?.getText()
              };
            }
          } else {
            metadata.Reflection[prop.getName()] = {
              type: "any"
            };
          }

          const currentGraph: ReplaceModelWith<ModelMetadata["Relations"], string | SymbolMapper> = <any>(
            metadata.Relations
          );
          if (pType) {
            const addLinkToGraph = (type: "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY") => {
              currentGraph.links ??= [];
              currentGraph.links.push({
                attribute: prop.getName(),
                model: getTypeIdFromTypeNode(pType.typeArguments[0], this.typeChecker),
                type
              });
            };
            switch (pType.typeName.getText()) {
              case "ModelParent":
                currentGraph.parent = {
                  attribute: prop.getName(),
                  model: getTypeIdFromTypeNode(pType.typeArguments[0], this.typeChecker)
                };
                break;
              case "ModelRelated":
                currentGraph.queries ??= [];
                currentGraph.queries.push({
                  attribute: prop.getName(),
                  model: getTypeIdFromTypeNode(pType.typeArguments[0], this.typeChecker),
                  targetAttribute: pType.typeArguments[1].getText().replace(/"/g, "")
                });
                break;
              case "ModelsMapped":
                currentGraph.maps ??= [];
                const cascadeDelete = prop.getJsDocTags().find(p => p.name === "CascadeDelete") !== undefined;
                const map = {
                  attribute: prop.getName(),
                  cascadeDelete,
                  model: getTypeIdFromTypeNode(pType.typeArguments[0], this.typeChecker),
                  targetLink: pType.typeArguments[1].getText().replace(/"/g, ""),
                  targetAttributes: pType.typeArguments[2]
                    .getText()
                    .replace(/"/g, "")
                    .split("|")
                    .map(t => t.trim())
                };
                if (!map.targetAttributes.includes("uuid")) {
                  map.targetAttributes.push("uuid");
                }
                currentGraph.maps.push(map);
                break;
              case "ModelLink":
                addLinkToGraph("LINK");
                break;
              case "ModelLinksMap":
                addLinkToGraph("LINKS_MAP");
                break;
              case "ModelLinksArray":
                addLinkToGraph("LINKS_ARRAY");
                break;
              case "ModelLinksSimpleArray":
                addLinkToGraph("LINKS_SIMPLE_ARRAY");
                break;
              case "Binary":
                currentGraph.binaries ??= [];
                currentGraph.binaries.push({
                  attribute: prop.getName(),
                  cardinality: "ONE"
                });
                break;
              case "Binaries":
                currentGraph.binaries ??= [];
                currentGraph.binaries.push({
                  attribute: prop.getName(),
                  cardinality: "MANY"
                });
                break;
            }
          }
          modelsMetadata[name] = metadata;
        });
    });

    // Resolve the symbol map
    Object.entries(modelsMetadata).forEach(([id, metadata]) => {
      const graph = metadata.Relations;
      if (graph.parent && (graph.parent.model as any).symbolMap) {
        if (isSymbolMapper(graph.parent.model)) {
          const value = symbolMap.get(graph.parent.model.id);
          if (!value) {
            throw new Error(`Cannot find parent model ${graph.parent.model.type} for ${id}.${graph.parent.attribute}`);
          }
          graph.parent.model = value;
        }
      }
      graph.links?.forEach(link => {
        if (isSymbolMapper(link.model)) {
          const value = symbolMap.get(link.model.id);
          if (!value) {
            //throw new Error(`Cannot find linked model ${link.model.type} for ${id}.${link.attribute}`);
          }
          link.model = value;
        }
      });
      graph.queries?.forEach(query => {
        if (isSymbolMapper(query.model)) {
          const value = symbolMap.get(query.model.id);
          if (!value) {
            throw new Error(`Cannot find query model ${query.model.type} for ${id}.${query.attribute}`);
          }
          query.model = value;
        }
      });
      graph.maps?.forEach(map => {
        if (isSymbolMapper(map.model)) {
          const value = symbolMap.get(map.model.id);
          if (!value) {
            throw new Error(`Cannot find map model ${map.model.type} for ${id}.${map.attribute}`);
          }
          map.model = value;
        }
      });
    });

    // Construct the hierarchy tree
    Object.values(models)
      .filter(p => !p.lib)
      .forEach(({ type, name, jsFile }) => {
        list[name] = jsFile;
        const ancestors = this.getClassTree(type)
          .map((t: any) => symbolMap.get(t.id))
          .filter(t => t !== undefined && t !== "Webda/CoreModel" && t !== name);
        ancestors.reverse();
        modelsMetadata[name].Ancestors = ancestors;
        ancestors.reverse();
      });

    // Compute children now
    Object.keys(modelsMetadata)
      .filter(i => modelsMetadata[i].Ancestors.length)
      .forEach(i => {
        modelsMetadata[modelsMetadata[i].Ancestors[0]].Subclasses.push(i);
      });
    return JSONUtils.sortObject(modelsMetadata);
  }

  /**
   * Explore models
   * @param models
   * @param schemas
   */
  exploreModelsAction(models: WebdaSearchResults, schemas: WebdaSchemaResults) {
    Object.values(models).forEach(model => {
      model.type
        .getProperties()
        .filter(
          prop =>
            prop.valueDeclaration?.kind === ts.SyntaxKind.MethodDeclaration &&
            ts.getDecorators(<ts.MethodDeclaration>prop.valueDeclaration) &&
            ts.getDecorators(<ts.MethodDeclaration>prop.valueDeclaration).find(annotation => {
              return ["Action"].includes(
                // @ts-ignore
                annotation.expression.expression &&
                  // @ts-ignore
                  annotation.expression.expression.getText()
              );
            })
        )
        .map(prop => prop.valueDeclaration)
        .forEach((method: ts.MethodDeclaration) => {
          this.checkMethodForContext(model.name, method, schemas);
        });
    });
  }

  /**
   * Explore services or beans for @Operation and @Route methods
   * @param services
   * @param schemas
   */
  exploreServices(services: WebdaSearchResults, schemas: WebdaSchemaResults) {
    Object.values(services).forEach(service => {
      service.type
        .getProperties()
        .filter(
          prop =>
            prop.valueDeclaration?.kind === ts.SyntaxKind.MethodDeclaration &&
            ts.getDecorators(<ts.MethodDeclaration>prop.valueDeclaration) &&
            ts.getDecorators(<ts.MethodDeclaration>prop.valueDeclaration).find(annotation => {
              return ["Operation"].includes(
                (<any>annotation.expression).expression && (<any>annotation.expression).expression.getText()
              );
            })
        )
        .map(prop => prop.valueDeclaration)
        .forEach((method: ts.MethodDeclaration) => {
          this.checkMethodForContext(service.type.getSymbol().getName(), method, schemas);
        });
    });
  }

  /**
   * Ensure each method that are supposed to have a context have one
   * And detect their input/output schema
   *
   * @param rootName
   * @param method
   * @param schemas
   * @returns
   */
  checkMethodForContext(rootName: string, method: ts.MethodDeclaration, schemas: WebdaSchemaResults) {
    // If first parameter is not a OperationContext, display an error
    if (
      method.parameters.length === 0 ||
      !this.extends(
        this.getClassTree(<ts.Type>this.typeChecker.getTypeFromTypeNode(method.parameters[0].type)),
        "@webda/core",
        "OperationContext"
      )
    ) {
      useLog("ERROR", `${rootName}.${method.name.getText()} does not have a OperationContext as first parameter`);
      return;
    }
    if (method.parameters.length > 1) {
      // Warn user if there is more than 1 parameter
      useLog(
        "WARN",
        `${rootName}.${method.name.getText()} have more than 1 parameter, only the first one will be used as context`
      );
    }
    const obj = <ts.TypeReferenceNode>method.parameters[0].type;
    if (!obj.typeArguments) {
      useLog("INFO", `${rootName}.${method.name.getText()} have no input defined, no validation will happen`);
      return;
    }
    const infos = [".input", ".output", ".parameters"];
    obj.typeArguments.slice(0, 3).forEach((schemaNode, index) => {
      // TODO Check if id is overriden and use it or fallback to method.name
      const name = rootName + "." + method.name.getText() + infos[index];
      if (ts.isTypeReferenceNode(schemaNode)) {
        const decl = schemas.get(this.typeChecker.getTypeFromTypeNode(schemaNode).getSymbol().declarations[0]);
        if (decl) {
          schemas.add(name, decl);
          return;
        }
      }
      schemas.add(name, schemaNode);
    });
  }

  /**
   * Generate the module
   */
  generate() {
    this.typeChecker = this.compiler.tsProgram.getTypeChecker();
    this.schemaGenerator = createSchemaGenerator(this.compiler.tsProgram, this.typeChecker);
    const objects = this.searchForWebdaObjects();
    this.exploreModelsAction(objects.models, objects.schemas);
    this.exploreServices(objects.moddas, objects.schemas);
    this.exploreServices(objects.beans, objects.schemas);
    const jsOnly = a => ({
      Import: a.jsFile,
      Schema: {}
    });
    const mod: WebdaModule = {
      $schema: "https://webda.io/schemas/webda.module.v4.json",
      beans: JSONUtils.sortObject(objects.beans, jsOnly),
      deployers: JSONUtils.sortObject(objects.deployers, jsOnly),
      moddas: JSONUtils.sortObject(objects.moddas, jsOnly),
      models: this.processModels(objects.models),
      schemas: {}
    };
    // Dispatch schemas
    Object.entries(objects.schemas.generateSchemas(this)).forEach(([section, schemas]) => {
      for (const [name, schema] of Object.entries(schemas)) {
        if (!mod[section][name] && section !== "schemas") {
          continue;
        }
        if (section === "schemas") {
          mod[section][name] = schema;
        } else {
          mod[section][name].Schema = schema;
          mod["schemas"][name] = schema;
        }
      }
    });
    FileUtils.save(mod, this.compiler.project.getAppPath("webda.module.json"));
    return mod;
  }
}

export function generateModule(compiler: Compiler) {
  try {
    return new ModuleGenerator(compiler).generate();
  } catch (err) {
    useLog("ERROR", "Cannot generate module", err.message);
  }
}

/**
 * Webda objects information within the project
 */
type WebdaSearchResult = {
  type: ts.Type;
  symbol: ts.Symbol;
  node: ts.Node;
  tags: {
    [key: string]: string;
  };
  jsFile: string;
  name: string;
  lib: boolean;
};

/**
 * Define the map of Webda objects
 */
type WebdaSearchResults = {
  [key: string]: WebdaSearchResult;
};

/**
 * Webda Schema Results
 */
class WebdaSchemaResults {
  protected store: {
    [key: string]: {
      name: string;
      schemaNode?: ts.Node;
      link?: string;
      title?: string;
      addOpenApi: boolean;
      section: "beans" | "moddas" | "models" | "schemas" | "deployers";
    };
  } = {};
  protected byNode = new Map<ts.Node, string>();

  get(node: ts.Node) {
    if (this.byNode.has(node)) {
      return this.byNode.get(node);
    }
  }

  /**
   * Generate all schemas
   * @param info
   */
  generateSchemas(moduleGenerator: ModuleGenerator): { [key: string]: { [key: string]: JSONSchema7 } } {
    const schemas = {};
    Object.entries(this.store)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([name, { schemaNode, link, title, addOpenApi, section }]) => {
        schemas[section] ??= {};
        if (schemaNode) {
          schemas[section][name] = moduleGenerator.generateSchema(schemaNode, title || name);
          if (addOpenApi && schemas[name]) {
            schemas[section][name].properties ??= {};
            schemas[section][name].properties["openapi"] = {
              type: "object",
              additionalProperties: true
            };
          }
        } else {
          schemas[section][name] = link;
        }
      });
    return schemas;
  }

  add(
    name: string,
    info?: ts.Node | string,
    title?: string,
    addOpenApi: boolean = false,
    section: "schemas" | "models" | "beans" | "deployers" | "moddas" = "schemas"
  ) {
    if (typeof info === "object") {
      this.store[name] = {
        name: name,
        schemaNode: info,
        title,
        addOpenApi,
        section
      };
      this.byNode.set(info, name);
    } else {
      this.store[name] = {
        name: name,
        link: info,
        title,
        addOpenApi,
        section
      };
    }
  }
}
