import * as ts from "typescript";
import * as path from "path";
import { Application, Core } from "@webda/core";
import * as glob from "glob";
import * as stringify from "json-stable-stringify";
import { createHash } from "crypto";
import { JSONSchema7 } from "json-schema";
export { Program, CompilerOptions, Symbol } from "typescript";
import { writeFileSync, unlinkSync, stat } from "fs";
import { tsquery } from "@phenomnomnominal/tsquery";
import { ConsoleLogger } from "@webda/workout";
import { runInThisContext } from "vm";
import { type } from "os";

export type SymbolRef = {
  name: string;
  typeName: string;
  fullyQualifiedName: string;
  symbol: ts.Symbol;
};

export class TypescriptAnalyzer {
  symbols: SymbolRef[] = [];
  allSymbols: { [name: string]: ts.Type } = {};
  userSymbols: { [name: string]: ts.Symbol } = {};
  inheritingTypes: { [baseName: string]: string[] } = {};
  workingDir: string;
  sourceFile: ts.SourceFile;
  app: Application;

  types: {
    [key: string]: {
      library: boolean;
      type: ts.Type;
      extenders: Set<string>;
    };
  };

  constructor(app: Application) {
    this.app = app;
    this.types = {};
  }

  async analyze() {
    await this.browseProgram(this.programFromConfig());
  }

  programFromConfig(app: Application = this.app): ts.Program {
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

  getParentStatement(node: ts.Node): ts.Node {
    let parent = node;
    while (parent && !ts.SyntaxKind[parent.kind].endsWith("Statement")) {
      parent = parent.parent;
    }
    return parent;
  }

  async browseProgram(program: ts.Program) {
    const typeChecker = program.getTypeChecker();
    this.workingDir = program.getCurrentDirectory();
    // To compile
    // let info = program.emit();
    process.chdir(this.app.getAppPath());
    console.log("Scanned", Object.keys(this.types).length, "types");
    console.log("Custom types: ", Object.values(this.types).filter(n => !n.library).length);
    //this.app.generateModule();
    this.app.loadModules();
    let module = this.app.getModules();
    module.sources.forEach(f => require(this.app.getAppPath(f)));

    let core = new Core(this.app);
    new ConsoleLogger(core.getWorkerOutput(), "DEBUG");
    await core.init();
    const services = core.getServices();
    const servicesSource = {};
    Object.keys(services).forEach(id => {
      let source = module.services[services[id].getParameters().type.toLowerCase()];
      if (!source && id.startsWith("webda/")) {
      }
      servicesSource[id] = {
        source,
        type: services[id].getParameters().type.toLowerCase()
      };
    });
    console.log("Services to find", servicesSource);

    /*
    program.getSourceFiles().forEach((sourceFile, _sourceFileIdx) => {
      const relativePath = path.relative(this.workingDir, sourceFile.fileName);
      this.sourceFile = sourceFile;
      let deep =
        this.sourceFile.fileName.startsWith(this.app.getAppPath()) &&
        !this.sourceFile.fileName.includes("node_modules");
      if (!deep) {
        this.inspect(sourceFile, typeChecker, deep);
      }
    });
    */
    program.getSourceFiles().forEach((sourceFile, _sourceFileIdx) => {
      const relativePath = path.relative(this.workingDir, sourceFile.fileName);
      this.sourceFile = sourceFile;
      let deep = program.isSourceFileDefaultLibrary(sourceFile);
      this.inspect(sourceFile, typeChecker, deep);
      return;
      console.log("File", sourceFile.fileName);
      for (let route of tsquery(sourceFile, "Decorator [name=Route]")) {
        let method: ts.MethodDeclaration = <any>route.parent.parent.parent;
        // @ts-ignore
        let contextName = tsquery(method, "Parameter:first-child")[0].name.escapedText;
        let stats = new Set<ts.Node>();
        tsquery(method, `Block Identifier[name='${contextName}']`).forEach(n => {
          let statement = this.getParentStatement(n);
          let type = typeChecker.getTypeAtLocation(n);

          const baseTypes = type.getBaseTypes() || [];
          if (!stats.has(statement)) {
            console.log(
              "Context usage:",
              type.getProperties(),
              baseTypes.map(n => typeChecker.typeToString(n, undefined, ts.TypeFormatFlags.UseFullyQualifiedType)),
              typeChecker.typeToString(type, undefined, ts.TypeFormatFlags.UseFullyQualifiedType),
              this.getParentStatement(n).getText()
            );
            stats.add(statement);
            this.displayTree(statement);
          }
        });

        // Go back to the method
        //this.displayTree(method);
      }

      //this.inspect(sourceFile, typeChecker, deep);
    });

    module = this.app.getModules();

    console.log("Webda Modules", module);
    Object.keys(module.services).forEach(e => {
      module.services[e.toLowerCase()] = module.services[e];
    });
    //let services = core.getServices();
    Object.keys(services).forEach(id => {
      servicesSource[id] = {
        source: module.services[services[id].getParameters().type.toLowerCase()],
        type: services[id].getParameters().type.toLowerCase()
      };
    });
    console.log("Services", servicesSource);
    // @ts-ignore
    console.log("Routes", Object.keys(core.getRouter().routes));
  }

  displayTree(node: ts.Node, level: number = 0) {
    console.log(".".repeat(level), ts.SyntaxKind[node.kind], node.getText().split("\n")[0].substr(0, 60));
    ts.forEachChild(node, n => this.displayTree(n, level + 1));
  }

  getDecoratorName(node: ts.Decorator) {
    return (<ts.CallExpression>(<ts.Decorator>node).getChildren()[1]).expression.getText();
  }

  recursiveSearchForSymbol(node, symbol) {
    ts.forEachChild(node, (n: any) => {
      console.log(ts.SyntaxKind[n.kind], n.getText().split("\n")[0].substr(0, 60), n.symbol);
      if (n === symbol) {
        console.log("FOUND SYMBOL USAGE");
      }
      this.recursiveSearchForSymbol(n, symbol);
    });
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
      const name = typeName; //!args.uniqueNames ? typeName : `${typeName}.${this.generateHashOfNode(node, relativePath)}`;
      //console.log("Types", deep, fullyQualifiedName, typeName, name);
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

  isUserFile(file: ts.SourceFile) {
    return !file.hasNoDefaultLib;
  }

  generateHashOfNode(node: ts.Node, relativePath: string): string {
    return createHash("md5").update(relativePath).update(node.pos.toString()).digest("hex").substring(0, 8);
  }
}

//new TypescriptAnalyzer(new Application("/datas/git/webda.io/sample-app")).analyze();
new TypescriptAnalyzer(new Application("/datas/git/tellae/whale")).analyze();
