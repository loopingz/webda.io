import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { createQlValidatorTransformer } from "./qlvalidator.js";

/**
 * Build an in-memory TS Program from inline source. Mirrors the helper in
 * `behaviors.spec.ts`. We pass `lib: []` and provide just enough stub types
 * to avoid pulling in the full stdlib (which would slow tests to a crawl).
 */
function createTestProgram(sources: Record<string, string>): ts.Program {
  const opts: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    lib: ["es2022"]
  };
  const host = ts.createCompilerHost(opts);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, lv, onErr) => {
    if (sources[fileName]) {
      return ts.createSourceFile(fileName, sources[fileName], lv);
    }
    return original(fileName, lv, onErr);
  };
  host.fileExists = fn => fn in sources || ts.sys.fileExists(fn);
  host.readFile = fn => sources[fn] ?? ts.sys.readFile(fn);
  return ts.createProgram(Object.keys(sources), opts, host);
}

function runValidator(
  program: ts.Program,
  fileName: string
): {
  output: string;
  diagnostics: ts.Diagnostic[];
} {
  const diagnostics: ts.Diagnostic[] = [];
  const factory = createQlValidatorTransformer(ts, program, {
    onDiagnostic: d => diagnostics.push(d),
    throwOnError: false
  });
  const sourceFile = program.getSourceFile(fileName)!;
  const result = ts.transform(sourceFile, [factory]);
  const printer = ts.createPrinter();
  const output = printer.printFile(result.transformed[0] as ts.SourceFile);
  result.dispose();
  return { output, diagnostics };
}

describe("qlvalidator skeleton", () => {
  it("is a no-op when no call site uses WebdaQLString", () => {
    const program = createTestProgram({
      "test.ts": `
        function plain(q: string) { return q; }
        plain("hello");
      `
    });

    const { output, diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('plain("hello")');
  });

  it("recognises a parameter typed as WebdaQLString<T> and parses literal", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'x'");
      `
    });

    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("rejects an unknown attribute with WQL9001", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("bogus = 'x'");
      `
    });

    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9001);
    expect(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n")).toMatch(/bogus/);
  });
});

describe("qlvalidator — grammar errors", () => {
  it("emits WQL9002 with parser position info on syntax error", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title === 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9002);
  });

  it("emits WQL9002 on unterminated string literal in WebdaQL", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'unterminated");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9002)).toBe(true);
  });

  it("does NOT emit WQL9002 on a valid AND/OR query", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string; status: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'x' AND status = 'pub'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });
});
