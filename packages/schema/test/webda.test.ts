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
            // Check for toJSON method
            let hasToDto: ts.MethodDeclaration | undefined;
            let hasFromDto: ts.MethodDeclaration | undefined;
            let hasToJSON: ts.MethodDeclaration | undefined;
            // Check if toDto/fromDto/toJSON methods exist
            node.members.forEach(member => {
              if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
                if (member.name.text === "toDto" && ts.isMethodDeclaration(member)) {
                  hasToDto = member;
                } else if (member.name.text === "fromDto" && ts.isMethodDeclaration(member)) {
                  hasFromDto = member;
                } else if (member.name.text === "toJSON" && ts.isMethodDeclaration(member)) {
                  hasToJSON = member;
                }
              }
            });
            const schema = generator.getSchemaFromNodes([node], { type: "input", asRef: false });
            const schemaOutput = generator.getSchemaFromNodes([node], { type: "output", asRef: false });
            if (hasToDto !== undefined) {
              // Get the return type of toDto
              const toDtoType = generator.checker.getReturnTypeOfSignature(
                generator.checker.getSignatureFromDeclaration(hasToDto)!
              );
              // Get the return type of toDto
              const schemaDtoOut = generator.getSchemaFromType(generator.checker.getApparentType(toDtoType), { type: "input", asRef: false });
              console.log("Schema Output", JSON.stringify(schemaDtoOut, null, 2));
            } else {
              console.log("No toDto method, skipping use 'output'");
              console.log(JSON.stringify(schemaOutput, null, 2));
            }
            if (hasFromDto) {
              // Get the parameter type of fromDto
              const fromDtoType = generator.checker.getTypeAtLocation(hasFromDto.parameters[0]);
              const dtoIn = generator.getSchemaFromType(generator.checker.getApparentType(fromDtoType), { type: "input", asRef: false });
              console.log("Schema Input from fromDto param", JSON.stringify(dtoIn, null, 2));
            } else {
              console.log("No fromDto method, skipping use 'input'");
              console.log(JSON.stringify(schema, null, 2));
            }
            if (hasToJSON) {
              // Get the return type of toDto
              const toJsonType = generator.checker.getReturnTypeOfSignature(
                generator.checker.getSignatureFromDeclaration(hasToJSON)!
              );
              const schemaJson = generator.getSchemaFromType(generator.checker.getApparentType(toJsonType), { type: "output", asRef: false });
              console.log("Schema Stored", JSON.stringify(schemaJson, null, 2));
            } else {
              console.log("No toJSON method, skipping use 'output'");
              console.log(JSON.stringify(schemaOutput, null, 2));
            }
            console.log("Final Schema", JSON.stringify(schema, null, 2));
            console.log("Final Schema Output", JSON.stringify(schemaOutput, null, 2));
            //expect(schema).toMatchSnapshot(name + " schema");
          }
        }
      });
    });
  });
});
