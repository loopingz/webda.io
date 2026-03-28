#!/usr/bin/env node
/**
 * Option A: Use tsserver protocol to inspect a class and iterate over its properties.
 * After gathering the list of properties via a lightweight parse, we request quickinfo for each.
 * For richer expansion (handling SelfJSONed<this>) we also build a transient Program with the compiler API.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);

const fileArg = process.argv[2] || "packages/core/src/test.ts";
const classArg = process.argv[3] || "TestClass";
const absFile = path.resolve(fileArg);
const content = fs.readFileSync(absFile, "utf8");

// Basic AST walk to collect property positions inside the class
const source = ts.createSourceFile(absFile, content, ts.ScriptTarget.Latest, true);
let toJSONPos: { line: number; offset: number } | undefined;
const properties: { name: string; line: number; offset: number }[] = [];

function getLineAndOffset(pos: number) {
  const { line, character } = source.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, offset: character + 1 };
}

source.forEachChild(node => {
  if (ts.isClassDeclaration(node) && node.name?.text === classArg) {
    node.members.forEach(m => {
      if (ts.isPropertyDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
        const { line, offset } = getLineAndOffset(m.name.getStart());
        properties.push({ name: m.name.text, line, offset });
      }
      if (ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name) && m.name.text === "toJSON" && m.type) {
        toJSONPos = getLineAndOffset(m.type.getStart());
      }
    });
  }
});

// Spawn tsserver (resolve via createRequire in ESM context)
const tsserverPath = require.resolve("typescript/lib/tsserver.js");
const tsserver = spawn("node", [tsserverPath], { stdio: ["pipe", "pipe", "inherit"] });

function send(cmd: any) {
  tsserver.stdin.write(JSON.stringify(cmd) + "\n");
}

let seq = 0;
function req(command: string, args: any) {
  send({ seq: seq++, type: "request", command, arguments: args });
}

type Pending = { tag: string; prop?: string };
const pending = new Map<number, Pending>();

tsserver.stdout.on("data", chunk => {
  const lines = chunk.toString().trim().split(/\r?\n/).filter(Boolean);
  for (const l of lines) {
    let msg: any;
    try {
      msg = JSON.parse(l);
    } catch {
      continue;
    }
    if (msg.type === "response") {
      const meta = pending.get(msg.request_seq);
      if (meta && msg.body) {
        if (meta.tag === "quickinfo-prop") {
          console.log(`Property ${meta.prop}: ${msg.body.displayString}`);
        } else if (meta.tag === "quickinfo-tojson") {
          console.log("toJSON return quickinfo:", msg.body.displayString);
        }
      }
      pending.delete(msg.request_seq);
      // When all done, augment with compiler API expansion
      if (pending.size === 0) {
        expandWithCompiler();
      }
    }
  }
});

function expandWithCompiler() {
  console.log("\n[Compiler API expansion]");
  const program = ts.createProgram({
    rootNames: [absFile],
    options: { strict: true, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.NodeJs }
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(absFile);
  if (!sf) return;
  // Cache of expanded types by internal type id -> expansion result (object/primitive/array/etc.)
  const expandedCache = new Map<number, any>();
  // Track currently expanding to handle immediate self recursion
  const inProgress = new Set<number>();

  function isUndefinedInUnion(t: ts.Type): boolean {
    return t.isUnion() && t.types.some(u => !!(u.flags & ts.TypeFlags.Undefined));
  }

  function hasToJSON(t: ts.Type): ts.Signature | undefined {
    const toJSON = t.getProperty("toJSON");
    if (!toJSON) return;
    const decl = toJSON.valueDeclaration || toJSON.declarations?.[0];
    if (!decl) return;
    if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) {
      const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
      return sig || undefined;
    }
    return;
  }

  function isSelfJSONed(t: ts.Type): boolean {
    // Check alias symbol name
    if (t.aliasSymbol && t.aliasSymbol.getName() === "SelfJSONed") return true;
    // Fallback to string match (compiler sometimes returns alias form as string)
    const str = checker.typeToString(t);
    return /^SelfJSONed<.*>$/.test(str);
  }

  function expandSelfJSONedArg(t: ts.Type, depth: number): any {
    const id = (t as any).id;
    if (expandedCache.has(id)) return expandedCache.get(id);
    if (inProgress.has(id)) {
      // Already expanding this type: return the placeholder to allow recursive property filling
      return expandedCache.get(id);
    }
    inProgress.add(id);
    const placeholder: Record<string, any> = {};
    expandedCache.set(id, placeholder);
    const propSyms = t.getProperties();
    if (propSyms.length === 0) {
      // Helpful debug
      console.log("[debug] No properties found on type:", checker.typeToString(t));
      // Apparent type fallback
      const apparent = checker.getApparentType(t);
      const apparentProps = apparent.getProperties().filter(p => {
        const d = p.valueDeclaration || p.declarations?.[0];
        return d && !(ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d) || ts.isMethodSignature(d));
      });
      if (apparentProps.length) {
        console.log("[debug] Using apparent type for expansion:", checker.typeToString(apparent));
        apparentProps.forEach(p => {
          const decl = p.valueDeclaration || p.declarations?.[0];
          if (!decl) return;
          const pType = checker.getTypeOfSymbolAtLocation(p, decl);
          placeholder[p.getName()] = expandJSONed(pType, depth + 1);
        });
        inProgress.delete(id);
        return placeholder;
      }
    } else {
      console.log(
        "[debug] Expanding type",
        checker.typeToString(t),
        "props:",
        propSyms.map(p => p.getName())
      );
    }
    t.getProperties().forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      placeholder[p.getName()] = expandJSONed(pType, depth + 1);
    });
    inProgress.delete(id);
    return placeholder;
  }

  // Simpler concrete expansion (no recursion through toJSON) used as fallback
  function expandConcreteDataType(t: ts.Type): Record<string, any> {
    const out: Record<string, any> = {};
    const props = checker.getApparentType(t).getProperties();
    props.forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      // Use recursive expansion instead of raw type string
      out[p.getName()] = expandJSONed(pType, 1);
    });
    return out;
  }

  // ---------------- DTO EXPANSION ----------------
  const dtoCache = new Map<number, any>();
  const dtoInProgress = new Set<number>();

  function expandDto(t: ts.Type, depth: number = 0): any {
    if (depth > 5) return "...";
    // Primitive direct mapping
    if (t.flags & ts.TypeFlags.StringLike) return "string";
    if (t.flags & ts.TypeFlags.NumberLike) return "number";
    if (t.flags & ts.TypeFlags.BooleanLike) return "boolean";
    if (t.flags & ts.TypeFlags.BigIntLike) return "string";
    if (t.flags & ts.TypeFlags.Null) return "null";
    if (t.flags & ts.TypeFlags.Undefined) return "undefined";
    const sym = t.getSymbol();
    if (sym?.getName() === "Date") return "string"; // DTO date -> ISO string
    const id = (t as any).id;
    if (dtoCache.has(id)) return dtoCache.get(id);
    if (dtoInProgress.has(id)) return dtoCache.get(id);
    dtoInProgress.add(id);

    // Array support
    if (sym?.getName() === "Array" || checker.getIndexTypeOfType(t, ts.IndexKind.Number)) {
      const arg = (t as any).typeArguments?.[0];
      const value = [arg ? expandDto(arg, depth + 1) : "any"];
      dtoInProgress.delete(id);
      dtoCache.set(id, value);
      return value;
    }

    // toDto / toJSON fallback
    let serializerSig: ts.Signature | undefined;
    let serializerType: ts.Type | undefined;
    const toDtoSym = sym?.members?.get?.(ts.escapeLeadingUnderscores("toDto"));
    if (toDtoSym) {
      const decl = toDtoSym.valueDeclaration || toDtoSym.declarations?.[0];
      if (decl && (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl))) {
        serializerSig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
        if (serializerSig) serializerType = checker.getReturnTypeOfSignature(serializerSig);
      }
    }
    if (!serializerType) {
      const toJSONSym = sym?.members?.get?.(ts.escapeLeadingUnderscores("toJSON"));
      if (toJSONSym) {
        const decl = toJSONSym.valueDeclaration || toJSONSym.declarations?.[0];
        if (decl && (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl))) {
          serializerSig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
          if (serializerSig) serializerType = checker.getReturnTypeOfSignature(serializerSig);
        }
      }
    }
    if (serializerType) {
      // If return is SelfJSONed<this>, treat like JSONed expansion of concrete type
      if (isSelfJSONed(serializerType)) {
        const aliasArgs = (serializerType as any).aliasTypeArguments as ts.Type[] | undefined;
        let inner: ts.Type = t;
        if (aliasArgs?.length) {
          inner = aliasArgs[0];
          if (checker.typeToString(inner) === "this") inner = t;
        }
        const value = expandConcreteDataType(inner);
        dtoInProgress.delete(id);
        dtoCache.set(id, value);
        return value;
      }
      // If return is NewDto<this> mapped type -> expand concrete using toDto/JSONed fallback per property
      if (isNewDto(serializerType)) {
        const aliasArgs = (serializerType as any).aliasTypeArguments as ts.Type[] | undefined;
        let inner: ts.Type = t;
        if (aliasArgs?.length) {
          inner = aliasArgs[0];
          if (checker.typeToString(inner) === "this") inner = t;
        }
        const value = expandConcreteDto(inner);
        dtoInProgress.delete(id);
        dtoCache.set(id, value);
        return value;
      }
      // Non SelfJSONed return: recurse DTO expansion
      const value = expandDto(serializerType, depth + 1);
      dtoInProgress.delete(id);
      dtoCache.set(id, value);
      return value;
    }

    // Object expansion (apparent type) if no serializer
    const apparent = checker.getApparentType(t);
    const props = apparent.getProperties().filter(p => {
      const d = p.valueDeclaration || p.declarations?.[0];
      return d && !(ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d) || ts.isMethodSignature(d));
    });
    if (!props.length) {
      const str = checker.typeToString(t);
      dtoInProgress.delete(id);
      dtoCache.set(id, str);
      return str;
    }
    const result: Record<string, any> = {};
    dtoCache.set(id, result);
    props.forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      result[p.getName()] = expandDto(pType, depth + 1);
    });
    dtoInProgress.delete(id);
    return result;
  }

  function isNewDto(t: ts.Type): boolean {
    return !!((t as any).aliasSymbol && (t as any).aliasSymbol.escapedName === "NewDto");
  }

  function expandConcreteDto(t: ts.Type): Record<string, any> {
    const out: Record<string, any> = {};
    const props = checker.getApparentType(t).getProperties();
    props.forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      // Skip methods
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      // If property type has toDto -> use its toDto return type mapped via expandDto
      const pSym = pType.getSymbol();
      let dtoReturn: ts.Type | undefined;
      const m = pSym?.members?.get?.(ts.escapeLeadingUnderscores("toDto"));
      if (m) {
        const mDecl = m.valueDeclaration || m.declarations?.[0];
        if (
          mDecl &&
          (ts.isMethodDeclaration(mDecl) || ts.isFunctionDeclaration(mDecl) || ts.isMethodSignature(mDecl))
        ) {
          const sig = checker.getSignatureFromDeclaration(mDecl as ts.SignatureDeclaration);
          if (sig) dtoReturn = checker.getReturnTypeOfSignature(sig);
        }
      }
      if (dtoReturn) {
        // Expand JSONed of dtoReturn (could itself be structured)
        out[p.getName()] = expandDto(dtoReturn, 1);
      } else {
        // Fallback to JSONed expansion semantics
        out[p.getName()] = expandJSONed(pType, 1);
      }
    });
    return out;
  }

  // ---------------- FROM DTO EXPANSION ----------------
  function isNewFromDto(t: ts.Type): boolean {
    return !!((t as any).aliasSymbol && (t as any).aliasSymbol.escapedName === "NewFromDto");
  }
  function isPartial(t: ts.Type): boolean {
    return !!((t as any).aliasSymbol && (t as any).aliasSymbol.escapedName === "Partial");
  }
  function expandConcreteFromDto(t: ts.Type): Record<string, any> {
    const out: Record<string, any> = {};
    const props = checker.getApparentType(t).getProperties();
    props.forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      const pSym = pType.getSymbol();
      let fromDtoParamType: ts.Type | undefined;
      const fromDtoSym = pSym?.members?.get?.(ts.escapeLeadingUnderscores("fromDto"));
      if (fromDtoSym) {
        const mDecl = fromDtoSym.valueDeclaration || fromDtoSym.declarations?.[0];
        if (
          mDecl &&
          (ts.isMethodDeclaration(mDecl) || ts.isFunctionDeclaration(mDecl) || ts.isMethodSignature(mDecl))
        ) {
          const sig = checker.getSignatureFromDeclaration(mDecl as ts.SignatureDeclaration);
          if (sig) {
            const params = sig.getParameters();
            if (params.length) {
              const pDecl = params[0].valueDeclaration || params[0].declarations?.[0];
              if (pDecl) fromDtoParamType = checker.getTypeOfSymbolAtLocation(params[0], pDecl);
            }
          }
        }
      }
      if (fromDtoParamType) {
        out[p.getName()] = expandDto(fromDtoParamType, 1); // reuse DTO expansion path for param type
      } else {
        out[p.getName()] = expandJSONed(pType, 1); // fallback to JSONed semantics
      }
    });
    return out;
  }
  function expandFromDtoParamType(t: ts.Type, classType: ts.Type): { shape: any; optionalAll: boolean } {
    // Handle Partial<NewFromDto<this>> pattern
    if (isPartial(t)) {
      const aliasArgs = (t as any).aliasTypeArguments as ts.Type[] | undefined;
      if (aliasArgs?.length) {
        const inner = aliasArgs[0];
        const expandedInner = expandNewFromDtoAlias(inner, classType);
        return { shape: expandedInner, optionalAll: true };
      }
    }
    // Direct NewFromDto
    if (isNewFromDto(t)) {
      const expanded = expandNewFromDtoAlias(t, classType);
      return { shape: expanded, optionalAll: false };
    }
    // Fallback: attempt concrete expansion
    return { shape: expandConcreteFromDto(classType), optionalAll: false };
  }
  function expandNewFromDtoAlias(t: ts.Type, classType: ts.Type): Record<string, any> {
    const aliasArgs = (t as any).aliasTypeArguments as ts.Type[] | undefined;
    let inner: ts.Type = classType;
    if (aliasArgs?.length) {
      inner = aliasArgs[0];
      if (checker.typeToString(inner) === "this") inner = classType;
    }
    return expandConcreteFromDto(inner);
  }

  function expandJSONed(t: ts.Type, depth: number): any {
    if (depth > 5) return "...";
    // Primitive-like (treat as leaf, skip visited tracking)
    if (t.flags & ts.TypeFlags.StringLike) return "string";
    if (t.flags & ts.TypeFlags.NumberLike) return "number";
    if (t.flags & ts.TypeFlags.BooleanLike) return "boolean";
    if (t.flags & ts.TypeFlags.BigIntLike) return "bigint";
    if (t.flags & ts.TypeFlags.Null) return "null";
    if (t.flags & ts.TypeFlags.Undefined) return "undefined";

    // Special case Date (and similar built-ins) as leaf
    const sym = t.getSymbol();
    if (sym?.getName() === "Date") {
      // Represent Date as its flexible JSON input/output
      return "Date"; // Could be refined to 'string|number|Date'
    }

    // If the type has a toDto() method, use its return type as JSONed representation
    if (sym) {
      const toDtoMember = sym.members?.get?.(ts.escapeLeadingUnderscores("toDto"));
      if (toDtoMember) {
        const decl = toDtoMember.valueDeclaration || toDtoMember.declarations?.[0];
        if (decl && (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl))) {
          const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
          if (sig) {
            const retType = checker.getReturnTypeOfSignature(sig);
            const mapped = checker.typeToString(retType);
            return mapped === "this" ? checker.typeToString(t) : mapped;
          }
        }
      }
    }

    const id = (t as any).id;
    if (expandedCache.has(id)) return expandedCache.get(id);
    if (inProgress.has(id)) {
      // Return existing placeholder during recursion
      return expandedCache.get(id);
    }
    // Will expand; create appropriate placeholder for object-like types.
    inProgress.add(id);

    // Union -> expand members
    if (t.isUnion()) {
      return t.types.map(x => expandJSONed(x, depth + 1));
    }

    // Array
    if (sym?.getName() === "Array" || checker.getIndexTypeOfType(t, ts.IndexKind.Number)) {
      const arg = (t as any).typeArguments?.[0];
      return [arg ? expandJSONed(arg, depth + 1) : "any"];
    }

    // toJSON override
    const jsonSig = hasToJSON(t);
    if (jsonSig) {
      const ret = checker.getReturnTypeOfSignature(jsonSig);
      // If return type is SelfJSONed<any>, expand underlying concrete type (t)
      if (isSelfJSONed(ret)) {
        // Prefer explicit generic arg if available, else use the original type t
        const aliasArgs = (ret as any).aliasTypeArguments as ts.Type[] | undefined;
        let inner: ts.Type = t;
        if (aliasArgs?.length) {
          inner = aliasArgs[0];
          if (checker.typeToString(inner) === "this") inner = t;
        }
        let value = expandSelfJSONedArg(inner, depth + 1);
        // Fallback if value ended up empty or undefined
        if (value === undefined || (typeof value === "object" && value && Object.keys(value).length === 0)) {
          value = expandConcreteDataType(inner);
        }
        inProgress.delete(id);
        expandedCache.set(id, value);
        return value;
      }
      // Non SelfJSONed return: recurse
      const nonAliasValue = expandJSONed(ret, depth + 1) ?? checker.typeToString(ret);
      inProgress.delete(id);
      expandedCache.set(id, nonAliasValue);
      return nonAliasValue;
    }

    // SelfJSONed<T> alias directly
    if (isSelfJSONed(t)) {
      const aliasArgs = (t as any).aliasTypeArguments as ts.Type[] | undefined;
      if (aliasArgs?.length) {
        let inner = aliasArgs[0];
        if (checker.typeToString(inner) === "this") inner = t;
        let value = expandSelfJSONedArg(inner, depth + 1);
        if (value === undefined || (typeof value === "object" && value && Object.keys(value).length === 0)) {
          value = expandConcreteDataType(inner);
        }
        inProgress.delete(id);
        expandedCache.set(id, value);
        return value;
      }
      // No generic args: treat as underlying concrete type
      let fallbackValue = expandSelfJSONedArg(t, depth + 1);
      if (
        fallbackValue === undefined ||
        (typeof fallbackValue === "object" && fallbackValue && Object.keys(fallbackValue).length === 0)
      ) {
        fallbackValue = expandConcreteDataType(t);
      }
      inProgress.delete(id);
      expandedCache.set(id, fallbackValue);
      return fallbackValue;
    }

    // Plain object expansion
    const props = t.getProperties();
    if (!props.length) {
      // Try apparent type fallback before primitive string
      const apparent = checker.getApparentType(t);
      const apparentProps = apparent.getProperties().filter(p => {
        const d = p.valueDeclaration || p.declarations?.[0];
        return d && !(ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d) || ts.isMethodSignature(d));
      });
      if (apparentProps.length) {
        const result: Record<string, any> = {};
        expandedCache.set(id, result);
        apparentProps.forEach(p => {
          const decl = p.valueDeclaration || p.declarations?.[0];
          if (!decl) return;
          const pType = checker.getTypeOfSymbolAtLocation(p, decl);
          result[p.getName()] = expandJSONed(pType, depth + 1);
        });
        inProgress.delete(id);
        return result;
      }
      const primitiveString = checker.typeToString(t);
      inProgress.delete(id);
      expandedCache.set(id, primitiveString);
      return primitiveString; // Fallback string form
    }
    const result: Record<string, any> = {};
    expandedCache.set(id, result); // store placeholder before recursion
    props.forEach(p => {
      const decl = p.valueDeclaration || p.declarations?.[0];
      if (!decl) return;
      if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
      const pType = checker.getTypeOfSymbolAtLocation(p, decl);
      result[p.getName()] = expandJSONed(pType, depth + 1);
    });
    inProgress.delete(id);
    return result;
  }

  sf.forEachChild(node => {
    if (ts.isClassDeclaration(node) && node.name?.text === classArg) {
      const classType = checker.getTypeAtLocation(node);
      const expanded = expandSelfJSONedArg(classType, 0);
      // Determine required keys (exclude optional & circular placeholders)
      const required: string[] = [];
      classType.getProperties().forEach(p => {
        const decl = p.valueDeclaration || p.declarations?.[0];
        if (!decl) return;
        if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
        const pType = checker.getTypeOfSymbolAtLocation(p, decl);
        const opt = pType.flags & ts.TypeFlags.Undefined || isUndefinedInUnion(pType);
        if (!opt) required.push(p.getName());
      });
      console.log("SelfJSONed<this> expanded properties:", expanded);
      console.log("Required keys:", required);

      // Build JSON Schema from expansion
      function buildSchema(exp: any): any {
        if (typeof exp === "string") {
          switch (exp) {
            case "string":
              return { type: "string" };
            case "number":
              return { type: "number" };
            case "boolean":
              return { type: "boolean" };
            case "bigint":
              return { type: "string" }; // Represent bigint as string
            case "Date":
              return { type: "string", format: "date-time" };
            default:
              // If still a class name but not expanded toJSON, fallback to string
              return { type: "string" };
          }
        }
        if (Array.isArray(exp)) {
          // Single element array -> items schema
          return { type: "array", items: buildSchema(exp[0]) };
        }
        if (exp && typeof exp === "object") {
          const props: Record<string, any> = {};
          Object.entries(exp).forEach(([k, v]) => {
            props[k] = buildSchema(v);
          });
          return { type: "object", properties: props };
        }
        // Fallback
        return {};
      }
      const schema = buildSchema(expanded);
      if (schema.type === "object") {
        schema.required = required;
        schema.additionalProperties = false;
      }
      console.log("JSON Schema:", JSON.stringify(schema, null, 2));

      // DTO expansion & schema
      const dtoExpanded = expandDto(classType, 0);
      console.log("DTO Expanded:", dtoExpanded);
      const dtoRequired: string[] = [];
      classType.getProperties().forEach(p => {
        const decl = p.valueDeclaration || p.declarations?.[0];
        if (!decl) return;
        if (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl)) return;
        const pType = checker.getTypeOfSymbolAtLocation(p, decl);
        const opt =
          pType.flags & ts.TypeFlags.Undefined ||
          (pType.isUnion() && pType.types.some(u => u.flags & ts.TypeFlags.Undefined));
        if (!opt) dtoRequired.push(p.getName());
      });
      const dtoSchema = buildSchema(dtoExpanded);
      if (dtoSchema.type === "object") {
        dtoSchema.required = dtoRequired;
        dtoSchema.additionalProperties = false;
      }
      console.log("DTO JSON Schema:", JSON.stringify(dtoSchema, null, 2));

      // fromDto parameter schema
      const fromDtoSym = classType.getSymbol()?.members?.get?.(ts.escapeLeadingUnderscores("fromDto"));
      if (fromDtoSym) {
        const decl = fromDtoSym.valueDeclaration || fromDtoSym.declarations?.[0];
        if (decl && (ts.isMethodDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isMethodSignature(decl))) {
          const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
          if (sig) {
            const params = sig.getParameters();
            if (params.length) {
              const pDecl = params[0].valueDeclaration || params[0].declarations?.[0];
              if (pDecl) {
                const paramType = checker.getTypeOfSymbolAtLocation(params[0], pDecl);
                const { shape, optionalAll } = expandFromDtoParamType(paramType, classType);
                // Post-filter: remove any keys whose value is 'never'
                Object.keys(shape).forEach(k => {
                  if (shape[k] === "never") delete shape[k];
                });
                console.log("fromDto Param Expanded:", shape);
                const fromDtoSchema = buildSchema(shape);
                if (fromDtoSchema.type === "object") {
                  let req: string[] = [];
                  if (!optionalAll) {
                    // Determine optional via union with undefined or Partial wrapper omitted
                    Object.entries(shape).forEach(([k, v]) => {
                      // If expansion returned 'undefined' skip requiring
                      if (v !== "undefined") req.push(k);
                    });
                  }
                  fromDtoSchema.required = req;
                  fromDtoSchema.additionalProperties = false;
                }
                console.log("fromDto Param JSON Schema:", JSON.stringify(fromDtoSchema, null, 2));
              }
            }
          }
        }
      }
    }
  });
  tsserver.kill();
}

// Open file and request quickinfo for each property & toJSON return type
req("open", { file: absFile, fileContent: content });
for (const prop of properties) {
  const reqSeq = seq;
  pending.set(reqSeq, { tag: "quickinfo-prop", prop: prop.name });
  req("quickinfo", { file: absFile, line: prop.line, offset: prop.offset });
}
if (toJSONPos) {
  const { line, offset } = toJSONPos; // Narrowed
  const reqSeq = seq;
  pending.set(reqSeq, { tag: "quickinfo-tojson" });
  req("quickinfo", { file: absFile, line, offset });
}
