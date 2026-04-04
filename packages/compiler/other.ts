

  /**
   * Derive a concrete JSON-like schema representation for SelfJSONed<this> for a given class.
   * Emulates mapped type expansion by:
   *  - Dropping methods & symbol keys
   *  - Applying toJSON() return type if present on a property type
   *  - Treating Date and subclasses as ISO strings (date-time)
   *  - Converting primitives to their base string/number/boolean textual form
   *  - Recursing into object properties up to depthLimit
   */
  getToJsonSchema(classNode: ts.ClassDeclaration, depthLimit: number = 4): Record<string, any> {
    const classType = this.typeChecker.getTypeAtLocation(classNode);
    const visited = new Set<ts.Type>();
    const expand = (t: ts.Type, depth: number): any => {
      if (visited.has(t) || depth > depthLimit) return this.typeChecker.typeToString(t);
      visited.add(t);
      // Primitive buckets
      if (t.flags & ts.TypeFlags.StringLike) return "string";
      if (t.flags & ts.TypeFlags.NumberLike) return "number";
      if (t.flags & ts.TypeFlags.BooleanLike) return "boolean";
      if (t.flags & ts.TypeFlags.BigIntLike) return "string"; // represent bigint as string
      if (t.symbol?.getName() === "Date" || (t.getBaseTypes?.() || []).some(b => b.symbol?.getName() === "Date")) {
        return "string"; // semantic date-time; caller can enrich if needed
      }
      // Array
      if (t.flags & ts.TypeFlags.Object && (t as ts.TypeReference).symbol?.getName() === "Array") {
        const arg = (t as ts.TypeReference).typeArguments?.[0];
        return { type: "array", items: arg ? expand(arg, depth + 1) : {} };
      }
      // Function -> use return type
      const sigs = t.getCallSignatures();
      if (sigs.length) {
        return expand(sigs[0].getReturnType(), depth + 1);
      }
      // Union
      if (t.isUnion()) {
        const parts = (t as ts.UnionType).types.map(p => expand(p, depth + 1));
        return { anyOf: parts };
      }
      // Object/class: build property map excluding methods & symbols
      const obj: Record<string, any> = {};
      t.getProperties().forEach(sym => {
        if (sym.getName().startsWith("[")) return; // skip symbol keys
        const pt = this.typeChecker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration ?? classNode);
        if (pt.getCallSignatures().length) return; // skip methods
        // toJSON override
        const toJsonSym = pt.getProperty("toJSON");
        let eff = pt;
        if (toJsonSym) {
          const jsType = this.typeChecker.getTypeOfSymbolAtLocation(toJsonSym, toJsonSym.valueDeclaration ?? classNode);
          const jsSigs = jsType.getCallSignatures();
          if (jsSigs.length) eff = jsSigs[0].getReturnType();
        }
        obj[sym.getName()] = expand(eff, depth + 1);
      });
      return obj;
    };
    return expand(classType, 0);
  }

  /**
   * Attempt to materialize SelfJSONed<ConcreteClass> in a fresh ephemeral Program.
   * This simulates what the language service might do: instantiate the mapped type
   * away from contextual `this` and then enumerate its properties.
   *
   * We cannot always import the original SelfJSONed if it is not exported; for robustness
   * we re-declare a simplified SelfJSONed alias capturing the semantics we need.
   */
  materializeSelfJSONedEphemeral(classNode: ts.ClassDeclaration): Record<string, string> | undefined {
    try {
      if (!classNode.name) return;
      const className = classNode.name.getText();
      const classFile = classNode.getSourceFile().fileName;
      const options = this.compiler.tsProgram.getCompilerOptions();
      const host = ts.createCompilerHost(options, true);
      // Read original class source via host for consistency
      const originalText = host.readFile(classFile);
      if (!originalText) return;
      const syntheticFileName = classFile + ".selfjsoned.ephemeral.ts";
      // Minimal SelfJSONed alias (not relying on external utility types)
      const selfJsonedAlias = `type SelfJSONed<T extends object> = { [K in keyof T as K extends string ? (T[K] extends Function ? never : K) : never]: T[K] extends { toJSON: () => infer R } ? R : T[K] };`;
      const syntheticContent = `import { ${className} } from "${classFile}";\n${selfJsonedAlias}\n type __Materialized = SelfJSONed<${className}>;\n declare const __m: __Materialized;`;
      // Override getSourceFile to serve synthetic file
      const previousGetSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        if (fileName === syntheticFileName) {
          return ts.createSourceFile(fileName, syntheticContent, options.target || ts.ScriptTarget.Latest, true);
        }
        return previousGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      };
      // Ensure fileExists and readFile know about synthetic file
      const prevFileExists = host.fileExists.bind(host);
      host.fileExists = f => (f === syntheticFileName ? true : prevFileExists(f));
      const prevReadFile = host.readFile.bind(host);
      host.readFile = f => (f === syntheticFileName ? syntheticContent : prevReadFile(f));
      const rootNames = [classFile, syntheticFileName];
      const program = ts.createProgram(rootNames, options, host);
      const checker = program.getTypeChecker();
      // Locate __m variable
      const synthSource = program.getSourceFile(syntheticFileName);
      if (!synthSource) return;
      // Helper to expand a SelfJSONed alias type recursively
      const expandSelfJSONed = (t: ts.Type, depth: number = 0, maxDepth: number = 5): any => {
        if (depth > maxDepth) return checker.typeToString(t);
        // Detect alias SelfJSONed
        const aliasSym = (t as any).aliasSymbol as ts.Symbol | undefined;
        const aliasArgs = (t as any).aliasTypeArguments as ts.Type[] | undefined;
        if (aliasSym && aliasSym.getName() === "SelfJSONed" && aliasArgs && aliasArgs.length === 1) {
          return expandObjectType(aliasArgs[0], depth + 1, maxDepth);
        }
        return checker.typeToString(t);
      };
      const isDateType = (t: ts.Type) =>
        t.symbol?.getName() === "Date" || (t.getBaseTypes?.() || []).some(b => b.symbol?.getName() === "Date");
      const expandObjectType = (t: ts.Type, depth: number, maxDepth: number): any => {
        if (depth > maxDepth) return checker.typeToString(t);
        // Primitive buckets
        if (t.flags & ts.TypeFlags.StringLike) return "string";
        if (t.flags & ts.TypeFlags.NumberLike) return "number";
        if (t.flags & ts.TypeFlags.BooleanLike) return "boolean";
        if (t.flags & ts.TypeFlags.BigIntLike) return "string"; // represent bigint as string
        if (isDateType(t)) return "string"; // ISO date string
        if (t.isUnion()) {
          return { anyOf: (t as ts.UnionType).types.map(p => expandObjectType(p, depth + 1, maxDepth)) };
        }
        // Array like
        if (t.flags & ts.TypeFlags.Object && (t as ts.TypeReference).symbol?.getName() === "Array") {
          const arg = (t as ts.TypeReference).typeArguments?.[0];
          return { type: "array", items: arg ? expandObjectType(arg, depth + 1, maxDepth) : {} };
        }
        // Function signature: show return type
        const sigs = t.getCallSignatures();
        if (sigs.length) return expandObjectType(sigs[0].getReturnType(), depth + 1, maxDepth);
        // Alias SelfJSONed again (if encountered outside earlier path)
        const aliasSym = (t as any).aliasSymbol as ts.Symbol | undefined;
        const aliasArgs = (t as any).aliasTypeArguments as ts.Type[] | undefined;
        if (aliasSym?.getName() === "SelfJSONed" && aliasArgs?.length === 1) {
          return expandObjectType(aliasArgs[0], depth + 1, maxDepth);
        }
        // Object: enumerate properties filtering out methods
        const obj: Record<string, any> = {};
        t.getProperties().forEach(sym => {
          if (sym.getName().startsWith("[")) return; // skip symbol keys
          const decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]);
          if (!decl) return;
          const propType = checker.getTypeOfSymbolAtLocation(sym, decl);
          if (propType.getCallSignatures().length) return; // skip methods
          // toJSON override
          const toJsonSym = propType.getProperty("toJSON");
          let effective = propType;
          if (toJsonSym) {
            const jsType = checker.getTypeOfSymbolAtLocation(toJsonSym, toJsonSym.valueDeclaration ?? decl);
            const jsSigs = jsType.getCallSignatures();
            if (jsSigs.length) effective = jsSigs[0].getReturnType();
          }
          // Recursive SelfJSONed expansion
          const aliasSymInner = (effective as any).aliasSymbol as ts.Symbol | undefined;
          const aliasArgsInner = (effective as any).aliasTypeArguments as ts.Type[] | undefined;
          if (aliasSymInner?.getName() === "SelfJSONed" && aliasArgsInner?.length === 1) {
            obj[sym.getName()] = expandObjectType(aliasArgsInner[0], depth + 1, maxDepth);
          } else {
            obj[sym.getName()] = expandObjectType(effective, depth + 1, maxDepth);
          }
        });
        return obj;
      };
      let materialized: Record<string, any> | undefined;
      ts.forEachChild(synthSource, node => {
        if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach(d => {
            if (d.name.getText() === "__m") {
              const t = checker.getTypeAtLocation(d.name);
              // Prefer apparent type if it expands more
              const apparent = checker.getApparentType(t);
              const finalType = apparent.getProperties().length ? apparent : t;
              //console.log(apparent);
              //this.typeChecker.getTypeAtLocation(apparent);

              materialized = {};
              finalType.getProperties().forEach(prop => {
                const decl = prop.valueDeclaration || (prop.declarations && prop.declarations[0]);
                if (!decl) return;
                const pType = checker.getTypeOfSymbolAtLocation(prop, decl);
                if (pType.getCallSignatures().length) return; // Skip methods
                const aliasSym = (pType as any).aliasSymbol as ts.Symbol | undefined;
                const aliasArgs = (pType as any).aliasTypeArguments as ts.Type[] | undefined;
                if (aliasSym?.getName() === "SelfJSONed" && aliasArgs?.length === 1) {
                  // Expand the inner object
                  materialized![prop.getName()] = expandObjectType(aliasArgs[0], 0, 5);
                } else {
                  materialized![prop.getName()] = expandSelfJSONed(pType);
                }
              });
            }
          });
        }
      });
      return materialized;
    } catch (e) {
      console.log("Ephemeral SelfJSONed materialization failed:", e);
    }
  }

  test() {
    // Search for the class TestClass
    this.compiler.tsProgram.getSourceFiles().forEach(sourceFile => {
      tsquery(sourceFile, "ClassDeclaration").forEach((classNode: ts.ClassDeclaration) => {
        if (classNode.name?.escapedText === "TestClass") {
          // Find all methods with the @TestMethod decorator
          const schema = this.schemaGenerator.createSchemaFromNodes([classNode as any]);
          useLog("INFO", "Schema for TestClass:", JSON.stringify(schema, null, 2));
        }
      });
    });
  }