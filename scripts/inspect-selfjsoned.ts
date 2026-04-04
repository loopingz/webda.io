#!/usr/bin/env ts-node
/*
 * Inspect expansion of SelfJSONed<this> for a class and show resolved return type
 * Usage: ts-node scripts/inspect-selfjsoned.ts packages/core/src/test.ts TestClass
 */
import ts from "typescript";
import path from "path";

function createProgram(fileNames: string[]): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    skipLibCheck: true,
    strict: true,
    baseUrl: ".",
    paths: {
      "@webda/*": ["packages/*/src"]
    }
  };
  return ts.createProgram({ rootNames: fileNames, options: compilerOptions });
}

function expandJSONed(checker: ts.TypeChecker, t: ts.Type, depth = 0, maxDepth = 2): string | Record<string, any> {
  if (depth > maxDepth) return "{...}";
  // Primitive shortcut
  if (t.flags & ts.TypeFlags.StringLike) return "string";
  if (t.flags & ts.TypeFlags.NumberLike) return "number";
  if (t.flags & ts.TypeFlags.BooleanLike) return "boolean";
  if (t.flags & ts.TypeFlags.BigIntLike) return "bigint";
  if (t.isUnion()) {
    return t.types.map(x => expandJSONed(checker, x, depth, maxDepth));
  }
  const sym = t.getSymbol();
  // Array detection
  if (sym?.getName() === "Array") {
    const arg = (t as any).typeArguments?.[0];
    return `[${arg ? expandJSONed(checker, arg, depth + 1, maxDepth) : "any"}]`;
  }
  // Check for toJSON method
  const toJSONSym = t.getProperty("toJSON");
  if (toJSONSym) {
    const decl = toJSONSym.valueDeclaration || toJSONSym.declarations?.[0];
    if (decl && (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl))) {
      const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
      if (sig) {
        const ret = checker.getReturnTypeOfSignature(sig);
        return expandJSONed(checker, ret, depth + 1, maxDepth);
      }
    }
  }
  // Object expansion
  if (t.getProperties().length) {
    const res: Record<string, any> = {};
    for (const p of t.getProperties()) {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) continue;
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) continue; // skip methods
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      res[p.getName()] = expandJSONed(checker, pType, depth + 1, maxDepth);
    }
    return res;
  }
  return checker.typeToString(t);
}

function run(fileName: string, className: string) {
  const program = createProgram([fileName]);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(fileName);
  if (!source) {
    console.error("Source file not found:", fileName);
    process.exit(1);
  }
  let found = false;
  ts.forEachChild(source, node => {
    if (ts.isClassDeclaration(node) && node.name?.getText() === className) {
      found = true;
      const classType = checker.getTypeAtLocation(node);
      console.log("Class type:", checker.typeToString(classType));
      const toJSON = node.members.find(
        m => ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name) && m.name.text === "toJSON"
      ) as ts.MethodDeclaration | undefined;
      if (!toJSON) {
        console.warn("No toJSON method found");
        return;
      }
      const sig = checker.getSignatureFromDeclaration(toJSON);
      const ret = sig ? checker.getReturnTypeOfSignature(sig) : undefined;
      if (ret) {
        console.log("Raw return type string:", checker.typeToString(ret));
      }
      // Manual expansion implementing SelfJSONed
      const expanded = expandJSONed(checker, classType);
      console.log("Expanded SelfJSONed<this> approximation:");
      console.dir(expanded, { depth: null });
    }
  });
  if (!found) {
    console.error("Class not found:", className);
    process.exit(2);
  }
}

if (require.main === module) {
  const [, , f, c] = process.argv;
  if (!f || !c) {
    console.error("Usage: ts-node scripts/inspect-selfjsoned.ts <file> <ClassName>");
    process.exit(9);
  }
  run(path.resolve(f), c);
}
