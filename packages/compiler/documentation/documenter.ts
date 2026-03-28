import { tsquery } from "@phenomnomnominal/tsquery";
import { FileUtils, JSONUtils } from "@webda/utils";
import { existsSync } from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as util from "util";

const nonenumerable: {
  (target: any, name: string): void;
  (target: any, name: string, desc: PropertyDescriptor): PropertyDescriptor;
} = (target: any, name: string, desc?: any) => {
  if (desc) {
    desc.enumerable = false;
    return desc;
  }
  Object.defineProperty(target, name, {
    set(value) {
      Object.defineProperty(this, name, {
        value,
        writable: true,
        configurable: true
      });
    },
    configurable: true
  });
};

/**
 * Compiler API
 *
 * https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 */

class NodeDocumentation<T extends ts.Node = ts.Node> {
  filename: string;
  name: string;
  filePosition: {
    start: number;
    end: number;
    startLine: number;
    endLine: number;
  };
  startLine: number;
  @nonenumerable
  parent?: NodeDocumentation;
  jsdoc?: string;

  constructor(node: T, parent?: NodeDocumentation) {
    this.filename = node.getSourceFile().fileName;

    this.filePosition = {
      start: node.getStart(),
      end: node.getEnd(),
      startLine: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
      endLine: node.getSourceFile().getLineAndCharacterOfPosition(node.getEnd()).line + 1
    };
    // @ts-ignore
    if (node.name) {
      // @ts-ignore
      this.name = node.name.getText();
    }
    this.parent = parent;
  }

  getChecker(): ts.TypeChecker {
    return this.parent?.getChecker();
  }

  getPackage(filename: string): string {
    // Search for the package.json
    let packageJson;
    while (!existsSync((packageJson = path.join(path.dirname(filename), "package.json")))) {
      filename = path.dirname(path.dirname(filename));
      if (filename.length < 4) break;
    }
    if (existsSync(packageJson)) {
      const desc = FileUtils.load(packageJson);
      return desc.name + ":" + desc.version;
    }
    return "unknown";
  }

  getBody(node: T): string | undefined {
    let body;
    node.forEachChild(b => {
      if (b.kind !== ts.SyntaxKind.Block) {
        return;
      }
      body = b.getFullText().trim();
    });
    return body;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DocumentationNode {}

class TypeDocumentation extends NodeDocumentation<ts.TypeNode> {
  name: string;
  constructor(node: ts.TypeNode, parent?: NodeDocumentation) {
    super(node, parent);
  }
}

class ParameterOrPropertyDocumentation extends NodeDocumentation<
  ts.ParameterDeclaration | ts.PropertySignature | ts.PropertyDeclaration
> {
  type: TypeDocumentation | "string" | "number" | "boolean";
  name: string;
  defaultValue: string;
  optional: boolean = false;

  constructor(
    node: ts.ParameterDeclaration | ts.PropertySignature | ts.PropertyDeclaration,
    parent?: NodeDocumentation
  ) {
    super(node, parent);
    this.name = node.name.getText();
    node.forEachChild(n => {
      if (
        n.kind === ts.SyntaxKind.QuestionToken ||
        n.kind === ts.SyntaxKind.FalseKeyword ||
        n.kind === ts.SyntaxKind.TrueKeyword ||
        n.kind === ts.SyntaxKind.NumericLiteral ||
        n.kind === ts.SyntaxKind.StringLiteral ||
        n.kind === ts.SyntaxKind.ArrayLiteralExpression ||
        n.kind === ts.SyntaxKind.ObjectLiteralExpression
      ) {
        this.optional = true;
        if (n.kind !== ts.SyntaxKind.QuestionToken) {
          this.defaultValue = n.getFullText().trim();
        } else {
          this.defaultValue = "undefined";
        }
      }
    });
    if (node.type) {
      this.type = new TypeDocumentation(node.type, this);
    }
  }
}

class ParameterDocumentation extends ParameterOrPropertyDocumentation {
  constructor(node: ts.ParameterDeclaration, parent?: NodeDocumentation) {
    super(node, parent);
  }
}

class PropertyDocumentation extends ParameterOrPropertyDocumentation {
  type: TypeDocumentation;
  name: string;
  defaultValue: string;
  optional: boolean;
  stringType: string;

  constructor(node: ts.PropertyDeclaration | ts.PropertySignature, parent?: NodeDocumentation) {
    super(node, parent);
    const checker = this.getChecker();
    if (checker) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
        this.stringType = checker.typeToString(type);
      }
    }
  }
}

class MethodDocumentation extends NodeDocumentation<ts.MethodDeclaration | ts.MethodSignature> {
  name: string;
  returnType: TypeDocumentation;
  returnStringType: string;
  parameters: ParameterDocumentation[];
  body: string;
  jstags: {
    tagName: string;
    comment: string;
  }[];
  scope: "public" | "protected" | "private";
  abstract: boolean = false;
  async: boolean = false;

  constructor(node: ts.MethodDeclaration | ts.MethodSignature, parent?: NodeDocumentation) {
    super(node, parent);
    this.parameters = node.parameters.map(p => new ParameterDocumentation(p));

    this.body = this.getBody(node);

    const checker = this.getChecker();
    if (checker) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        this.jsdoc = ts.displayPartsToString(symbol.getDocumentationComment(checker));
        this.jstags = ts
          .getAllJSDocTags(node, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
            return true;
          })
          .map(t => {
            try {
              return {
                tagName: t.tagName.getText(),
                comment: ts.getTextOfJSDocComment(t.comment)
              };
            } catch (err) {
              console.log(err);
            }
          });

        const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
        this.returnStringType = checker.typeToString(
          checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0].getReturnType()
        );
        console.log(checker.typeToString(checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0].getReturnType()));
      }
    }

    this.scope = "public";
    node.forEachChild(n => {
      if (n.kind === ts.SyntaxKind.PrivateKeyword) {
        this.scope = "private";
      } else if (n.kind === ts.SyntaxKind.ProtectedKeyword) {
        this.scope = "protected";
      } else if (n.kind === ts.SyntaxKind.AbstractKeyword) {
        this.abstract = true;
      } else if (n.kind === ts.SyntaxKind.AsyncKeyword) {
        this.async = true;
      }
    });
  }
}

class ClassInterfaceDocumentation extends NodeDocumentation<ts.ClassDeclaration | ts.InterfaceDeclaration> {
  package: string;
  stringType: string;

  @nonenumerable
  typeChecker: ts.TypeChecker;

  getChecker(): ts.TypeChecker {
    return this.typeChecker || this.parent?.getChecker();
  }

  constructor(node: ts.ClassDeclaration | ts.InterfaceDeclaration, parent?: NodeDocumentation | ts.TypeChecker) {
    super(node, parent instanceof NodeDocumentation ? parent : undefined);
    this.typeChecker = parent instanceof NodeDocumentation ? undefined : parent;
    this.package = this.getPackage(node.getSourceFile().fileName);
    const checker = this.getChecker();
    if (checker) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        this.jsdoc = ts.displayPartsToString(symbol.getDocumentationComment(checker));
        const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
        this.stringType = checker.typeToString(type);
        console.log("CLASS OR INTERFACE", this.stringType);
      }
    }
  }
}

class ClassDocumentation extends ClassInterfaceDocumentation {
  methods: MethodDocumentation[];
  properties: PropertyDocumentation[];
  construct: MethodDocumentation;
  abstract: boolean = false;

  constructor(node: ts.ClassDeclaration, parent?: NodeDocumentation | ts.TypeChecker) {
    super(node, parent);
    // Class Property
    this.properties = tsquery(node, "PropertyDeclaration").map(
      (n: ts.PropertyDeclaration) => new PropertyDocumentation(n, this)
    );
    // Class Method
    this.methods = tsquery(node, "MethodDeclaration").map(
      (n: ts.MethodDeclaration) => new MethodDocumentation(n, this)
    );

    // Get constructor
    this.construct = tsquery(node, "Constructor")
      .map((n: ts.MethodDeclaration) => new MethodDocumentation(n, this))
      .pop();

    // Check for modifier
    node.forEachChild(n => {
      if (n.kind === ts.SyntaxKind.AbstractKeyword) {
        this.abstract = true;
      }
    });
  }
}

class InterfaceDocumentation extends ClassInterfaceDocumentation {
  name: string;
  methods: MethodDocumentation[];
  properties: PropertyDocumentation[];

  constructor(node: ts.InterfaceDeclaration, parent?: NodeDocumentation | ts.TypeChecker) {
    super(node, parent);
    // Interface Property
    this.properties = tsquery(node, "PropertySignature").map(
      (n: ts.PropertySignature) => new PropertyDocumentation(n, this)
    );
  }
}

function projectFileFilter(node: ts.Node) {
  return !node.getSourceFile().isDeclarationFile;
}

export class Documenter {
  types: { [key: string]: DocumentationNode };
  documentation: NodeDocumentation[] = [];
  checker: ts.TypeChecker;

  query(node: ts.Node, query: string): ts.Node[] {
    return tsquery(node, query).filter(projectFileFilter);
  }

  process(program: ts.Program) {
    this.checker = program.getTypeChecker();
    program.getSourceFiles().forEach((source: ts.SourceFile) => {
      if (source.isDeclarationFile) {
        return;
      }

      this.documentation.push(
        ...this.query(source, "ClassDeclaration").map(
          (n: ts.ClassDeclaration) => new ClassDocumentation(n, this.checker)
        ),
        ...this.query(source, "InterfaceDeclaration").map(
          (n: ts.InterfaceDeclaration) => new InterfaceDocumentation(n, this.checker)
        )
      );
    });
  }

  print() {
    console.log(
      util.inspect(
        this.documentation.filter(n => n.filename.endsWith("custom.ts")),
        { depth: 10, colors: true }
      )
    );
    JSONUtils.saveFile(this.documentation, `${__dirname}/doc.json`);
    console.log("Saved in", `${__dirname}/doc.json`);
  }
}
