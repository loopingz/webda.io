import ts from "typescript";
import { useLog } from "@webda/workout";
import { JSONSchema7 } from "json-schema";
import { SchemaGenerator } from "@webda/schema";
import { Compiler } from "../compiler";

/**
 * Handles JSON Schema generation for models and services
 */
export class SchemaGeneratorWrapper {
  private schemaGenerator: SchemaGenerator;

  constructor(
    private compiler: Compiler,
    private typeChecker: ts.TypeChecker
  ) {
    this.schemaGenerator = new SchemaGenerator({
      program: compiler.tsProgram!,
      log: (...args: any[]) => useLog("DEBUG", ...args)
    });
  }

  /**
   * Generate model schemas (Input, Output, Stored)
   */
  generateModelSchemas(
    node: ts.Node,
    title?: string
  ): {
    Input: JSONSchema7;
    Output: JSONSchema7;
    Stored: JSONSchema7;
  } {
    useLog("INFO", `Generating model schemas for ${title}`);
    const res = {
      Input: {} as JSONSchema7,
      Output: {} as JSONSchema7,
      Stored: {} as JSONSchema7
    };

    const classType = this.typeChecker.getTypeAtLocation(node);

    const getSignature = (methodName: string): ts.Signature | undefined => {
      const apparent = this.typeChecker.getApparentType(classType);
      const symbol = apparent.getProperty(methodName) || classType.getProperty(methodName);
      if (!symbol) return undefined;
      const methodType = this.typeChecker.getTypeOfSymbolAtLocation(symbol, node);
      const sigs = this.typeChecker.getSignaturesOfType(methodType, ts.SignatureKind.Call);
      return sigs.length ? sigs[0] : undefined;
    };

    const toDtoSig = getSignature("toDto");
    const fromDtoSig = getSignature("fromDto");
    const toJSONSig = getSignature("toJSON");

    if (toDtoSig) {
      const toDtoType = this.typeChecker.getReturnTypeOfSignature(toDtoSig);
      res.Output = this.schemaGenerator.getSchemaFromType(toDtoType, { type: "output", asRef: false });
      // @ts-ignore
      res.Output.$webda = "toDto$return";
    } else {
      res.Output = this.schemaGenerator.getSchemaFromNodes([node], { type: "output", asRef: false });
      // @ts-ignore
      res.Output.$webda = "toDto$auto";
    }

    if (fromDtoSig) {
      const firstParam = fromDtoSig.parameters[0];
      const paramDecl = (firstParam as any).valueDeclaration || firstParam.declarations?.[0];
      const fromDtoParamType = paramDecl
        ? this.typeChecker.getTypeAtLocation(paramDecl)
        : this.typeChecker.getTypeOfSymbolAtLocation(firstParam, node);
      res.Input = this.schemaGenerator.getSchemaFromType(fromDtoParamType, { type: "input", asRef: false });
      // @ts-ignore
      res.Input.$webda = "fromDto$param";
    } else {
      res.Input = this.schemaGenerator.getSchemaFromNodes([node], { type: "input", asRef: false });
      // @ts-ignore
      res.Input.$webda = "fromDto$auto";
    }

    if (toJSONSig) {
      const toJsonType = this.typeChecker.getReturnTypeOfSignature(toJSONSig);
      res.Stored = this.schemaGenerator.getSchemaFromType(toJsonType, { type: "output", asRef: false });
      // @ts-ignore
      res.Stored.$webda = "toJSON$return";
    } else {
      res.Stored = this.schemaGenerator.getSchemaFromNodes([node], { type: "output", asRef: false });
      // @ts-ignore
      res.Stored.$webda = "toJSON$auto";
    }

    return res;
  }

  /**
   * Generate a single schema from a node
   */
  generateSchema(schemaNode: ts.Node, title?: string): JSONSchema7 {
    let res: JSONSchema7;
    try {
      useLog("INFO", "Generating schema for " + title);
      res = this.schemaGenerator.getSchemaFromNodes([schemaNode], {
        log: (...args: any) => {
          useLog("DEBUG", ...args);
        }
      });
      if (title) {
        res.title = title;
      }
    } catch (err) {
      useLog("WARN", `Cannot generate schema for ${schemaNode ? schemaNode.getText().split("\n")[0] : title}`, err);
    }
    return res!;
  }

  /**
   * Get the return type schema for an async method
   */
  getAsyncMethodReturnType(method: ts.MethodDeclaration): JSONSchema7 | undefined {
    const actionType = this.typeChecker.getApparentType(this.typeChecker.getTypeAtLocation(method));
    const signatures = this.typeChecker.getSignaturesOfType(actionType, ts.SignatureKind.Call);
    const returnType = this.typeChecker.getReturnTypeOfSignature(signatures[0]!);
    const promiseType = (returnType as ts.TypeReference).typeArguments?.[0];

    if (!promiseType) {
      useLog("WARN", `Cannot determine promise type for async method ${method.name.getText()}`);
      return undefined;
    }

    return this.schemaGenerator.getSchemaFromType(promiseType, {
      asRef: false,
      type: "output"
    });
  }

  /**
   * Get method parameters schema
   */
  getMethodParametersSchema(method: ts.MethodDeclaration): JSONSchema7 {
    const actionMethodType = this.typeChecker.getTypeAtLocation(method);
    const signatures = this.typeChecker.getSignaturesOfType(actionMethodType, ts.SignatureKind.Call);

    const parametersSchema: any = {
      type: "object",
      properties: {}
    };

    for (const param of signatures[0]!.parameters) {
      parametersSchema.properties![param.getName()] = this.schemaGenerator.getSchemaFromType(
        this.typeChecker.getTypeOfSymbolAtLocation(param, method.parent),
        {
          asRef: false,
          type: "input"
        }
      );
      delete parametersSchema.properties![param.getName()]["$schema"];
    }

    return parametersSchema;
  }

  /**
   * Get the underlying schema generator
   */
  getSchemaGenerator(): SchemaGenerator {
    return this.schemaGenerator;
  }
}
