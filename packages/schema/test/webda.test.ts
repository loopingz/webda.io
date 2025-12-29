import { describe, it, expect } from "vitest";
import { SchemaGenerator } from "../src/generator";
import ts from "typescript";

describe("webda schema generation", () => {
  it("generates schema for webda models", async () => {
    const generator = new SchemaGenerator({
      log: (...args) => {
        console.log("[SchemaGenerator]", ...args);
      },
      project: "./tsconfig.test.json",
      disableBooleanDefaultToFalse: true
    });
    // Get compiler program
    const program = generator.getProgram();
    program.getSourceFiles().forEach(sf => {
      if (sf.isDeclarationFile) return;
      // Uncomment to debug
      if (!sf.fileName.endsWith("webda/model.ts")) {
        return;
      }
      sf.forEachChild(node => {
        if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
          const name = node.name?.text;
          if (name && name === "ModelA") {
            console.log("Generating schema for", name);
            // Discover methods (including inherited) via the TypeScript checker
            const classType = generator.checker.getTypeAtLocation(node);
            const getSignature = (methodName: string): ts.Signature | undefined => {
              const apparent = generator.checker.getApparentType(classType);
              const symbol = apparent.getProperty(methodName) || classType.getProperty(methodName);
              if (!symbol) return undefined;
              const methodType = generator.checker.getTypeOfSymbolAtLocation(symbol, node);
              const sigs = generator.checker.getSignaturesOfType(methodType, ts.SignatureKind.Call);
              return sigs.length ? sigs[0] : undefined;
            };
            const toDtoSig = getSignature("toDto");
            const fromDtoSig = getSignature("fromDto");
            const toJSONSig = getSignature("toJSON");
            let hasToJSON: ts.MethodDeclaration | undefined;
             node.members.forEach(member => {
              if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
                if (member.name.text === "toJSON" && ts.isMethodDeclaration(member)) {
                  hasToJSON = member;
                }
              }
            });
            const schema = generator.getSchemaFromNodes([node], { type: "input", asRef: false });
            const schemaOutput = generator.getSchemaFromNodes([node], { type: "output", asRef: false });
            if (toDtoSig) {
              // Get the return type of toDto (inherited or local)
              const toDtoType = generator.checker.getReturnTypeOfSignature(toDtoSig);
              const schemaDtoOut = generator.getSchemaFromType(
                toDtoType,
                { type: "input", asRef: false }
              );
              console.log("Schema Output", JSON.stringify(schemaDtoOut, null, 2));
            } else {
              console.log("No toDto method (including inherited), skipping use 'output'");
              console.log(JSON.stringify(schemaOutput, null, 2));
            }
            if (fromDtoSig) {
              // Get the parameter type of fromDto's first param
              const firstParam = fromDtoSig.parameters[0];
              const paramDecl = (firstParam as any).valueDeclaration || firstParam.declarations?.[0];
              const fromDtoParamType = paramDecl
                ? generator.checker.getTypeAtLocation(paramDecl)
                : generator.checker.getTypeOfSymbolAtLocation(firstParam, node);
              const dtoIn = generator.getSchemaFromType(
                fromDtoParamType,
                { type: "input", asRef: false }
              );
              console.log("Schema Input from fromDto param", JSON.stringify(dtoIn, null, 2));
            } else {
              console.log("No fromDto method (including inherited), skipping use 'input'");
              console.log(JSON.stringify(schema, null, 2));
            }
            if (toJSONSig) {
              // Get the return type of toJSON (inherited or local)
              const toJsonType = generator.checker.getReturnTypeOfSignature(toJSONSig);
              const schemaJson = generator.getSchemaFromType(
                toJsonType,
                { type: "output", asRef: false }
              );
              console.log("Schema Stored", JSON.stringify(schemaJson, null, 2));
            } else {
              console.log("No toJSON method (including inherited), skipping use 'output'");
              console.log(JSON.stringify(schemaOutput, null, 2));
            }
            //console.log("Final Schema", JSON.stringify(schema, null, 2));
            //console.log("Final Schema Output", JSON.stringify(schemaOutput, null, 2));
            //expect(schema).toMatchSnapshot(name + " schema");
          }
        }
      });
    });
  });
});
