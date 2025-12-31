import { assert, describe, it, expect } from "vitest";
import { SchemaGenerator } from "../src/generator";
import ts from "typescript";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { JSONSchema7 } from "json-schema";

describe("webda schema generation", () => {
  it("generates schema for webda models", async () => {
    let subtype: "default" | "dto-in" | "dto-out" = "default";
    const generator = new SchemaGenerator({
      log: (...args) => {
        console.log("[SchemaGenerator]", ...args);
      },
      project: "./tsconfig.test.json",
      disableBooleanDefaultToFalse: true,
      transformer: options => {
        const getMethodType = (methodName: string): ts.Type | undefined => {
          // Check for toJSON method
          const apparent = generator.checker.getApparentType(options.type);
          const symbol = apparent.getProperty(methodName) || options.type.getProperty(methodName);
          if (!symbol || !options.node) {
            return undefined;
          }
          return generator.checker.getTypeOfSymbolAtLocation(symbol, options.node);
        };
        const returnMethod = (methodName: string) => {
          const methodType = getMethodType(methodName);
          if (!methodType) {
            return options;
          }
          const returnType = generator.checker.getReturnTypeOfSignature(
            generator.checker.getSignaturesOfType(methodType, ts.SignatureKind.Call)[0]
          ) as ts.Type;
          //console.log("Replacing type with toJSON return type for default subtype");
          return {
            ...options,
            type: returnType
          };
        };
        const firstArgument = () => {
          const methodType = getMethodType("fromDto");
          if (!methodType) {
            return options;
          }
          const signature = generator.checker.getSignaturesOfType(methodType, ts.SignatureKind.Call)[0];
          const params = signature.getParameters();
          if (params.length !== 1) {
            return options;
          }
          const firstParamType = generator.checker.getTypeOfSymbolAtLocation(params[0], options.node!) as ts.Type;
          return {
            ...options,
            type: firstParamType
          };
        };
        // Example transformer that could modify schema generation options
        // For now, it just returns the options unchanged
        // Discover methods (including inherited) via the TypeScript checker
        if (subtype === "default") {
          return returnMethod("toJSON");
        } else if (subtype === "dto-out") {
          // Check for toDto method
          return returnMethod("toDto");
        } else if (subtype === "dto-in") {
          return firstArgument();
        }
        return options;
      }
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
          if (["ModelA", "SubModelA", "UndefinedModel", "ModelB"].includes(name || "")) {
            // Discover methods (including inherited) via the TypeScript checker
            const subtypes = {
              default: "toJSON",
              "dto-out": "toDto",
              "dto-in": "fromDto"
            };
            if (name === "ModelA") {
              // Check for action method
              const actionType = program
                .getTypeChecker()
                .getApparentType(generator.checker.getTypeAtLocation(node))
                .getProperty("action");
              if (!actionType) {
                assert.fail(`ModelA is missing action method`);
              }
              // Get the type of the action method
              const actionMethodType = generator.checker.getTypeOfSymbolAtLocation(actionType, node) as ts.Type;
              const signatures = generator.checker.getSignaturesOfType(actionMethodType, ts.SignatureKind.Call);
              if (signatures.length === 0) {
                assert.fail(`ModelA action method has no call signatures`);
              }
              console.log(`Generating schema for ModelA action method...`, signatures[0]);
              // action(email: string, data: { info: string; test: string }): Promise<{ success: boolean; results: ModelA[] }>
              const parametersSchema: any = {
                type: "object",
                properties: {}
              };
              for (const param of signatures[0]!.parameters) {
                parametersSchema.properties![param.getName()] = generator.getSchemaFromType(
                  generator.checker.getTypeOfSymbolAtLocation(param, node),
                  {
                    asRef: false,
                    type: "input"
                  }
                );
                delete parametersSchema.properties![param.getName()]["$schema"];
              }
              const returnType = generator.checker.getReturnTypeOfSignature(signatures[0]!);
              // Ensure it is a Promise and get the resolved type
              const returnTypeString = generator.checker.typeToString(returnType);
              if (!returnTypeString.startsWith("Promise<")) {
                assert.fail(`ModelA action method does not return a Promise, got: ${returnTypeString}`);
              }
              const promiseType = (returnType as ts.TypeReference).typeArguments?.[0];
              if (!promiseType) {
                assert.fail(`ModelA action method Promise has no type arguments`);
              }
              const resultSchema = generator.getSchemaFromType(promiseType, {
                asRef: false,
                type: "output"
              });

              const schemas = {
                output: resultSchema,
                input: parametersSchema
              };
              for (const [stName, schema] of Object.entries(schemas)) {
                subtype = stName as typeof subtype;
                const schemaFile: string = `test/webda/action.${stName}.schema.json`;
                const exists = existsSync(schemaFile);
                if (process.env["UPDATE_FIXTURES"] || !exists) {
                  writeFileSync(schemaFile, JSON.stringify(schema, null, 2), {
                    encoding: "utf-8"
                  });
                  if (!exists && !process.env["UPDATE_FIXTURES"]) {
                    assert.fail(
                      `Schema fixture ${schemaFile} did not exist and has been created. Please verify its correctness.`
                    );
                  }
                } else {
                  const existing = JSON.parse(readFileSync(schemaFile, { encoding: "utf-8" }) || "{}");
                  expect(schema, `Fail for ${name} with subtype ${subtype} ${schemaFile}`).toEqual(existing);
                }
              }
            }
            for (const st of Object.entries(subtypes)) {
              subtype = st[0] as typeof subtype;
              const schemaFile: string = `test/webda/${name}.${st[1]}.schema.json`;
              const schema = generator.getSchemaForTypeName(name!, sf.fileName, {
                type: subtype === "dto-in" ? "input" : "output",
                asRef: false
              });
              const exists = existsSync(schemaFile);
              if (process.env["UPDATE_FIXTURES"] || !exists) {
                writeFileSync(schemaFile, JSON.stringify(schema, null, 2), {
                  encoding: "utf-8"
                });
                if (!exists && !process.env["UPDATE_FIXTURES"]) {
                  assert.fail(
                    `Schema fixture ${schemaFile} did not exist and has been created. Please verify its correctness.`
                  );
                }
              } else {
                const existing = JSON.parse(readFileSync(schemaFile, { encoding: "utf-8" }) || "{}");
                expect(schema, `Fail for ${name} with subtype ${subtype} ${schemaFile}`).toEqual(existing);
              }
            }
          }
        }
      });
    });
  });
});
