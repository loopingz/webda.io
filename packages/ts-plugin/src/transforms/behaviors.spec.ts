

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  BEHAVIOR_PARENT_KEY,
  computeBehaviorMetadata,
  createBehaviorTransformer
} from "./behaviors";

/**
 * Helper: create an in-memory TypeScript program from inline source code.
 * Mirrors the pattern used in `accessors.spec.ts`.
 */
function createTestProgram(sources: Record<string, string>, options?: ts.CompilerOptions) {
  const fileNames = Object.keys(sources);
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    declaration: true,
    ...options
  };

  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError) => {
    if (sources[fileName]) {
      return ts.createSourceFile(fileName, sources[fileName], languageVersion);
    }
    return originalGetSourceFile(fileName, languageVersion, onError);
  };
  host.fileExists = fileName => fileName in sources || ts.sys.fileExists(fileName);
  host.readFile = fileName => sources[fileName] ?? ts.sys.readFile(fileName);

  return ts.createProgram(fileNames, compilerOptions, host);
}

/**
 * Helper: write inline source files to a temp directory and create a TS program
 * that resolves cross-file imports correctly. The in-memory variant above
 * has trouble with TypeScript module resolution for non-trivial paths;
 * this disk-backed variant is what the module-generator tests use too.
 */
function createDiskProgram(tmpDir: string, sources: Record<string, string>, options?: ts.CompilerOptions) {
  for (const [name, content] of Object.entries(sources)) {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  const fileNames = Object.keys(sources).map(name => path.join(tmpDir, name));
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    rootDir: tmpDir,
    outDir: path.join(tmpDir, "lib"),
    ...options
  };
  return { program: ts.createProgram(fileNames, compilerOptions), tmpDir };
}

/**
 * Print a transformed source file as a string.
 */
function transformAndPrint(program: ts.Program, fileName: string): string {
  const factory = createBehaviorTransformer(ts, program);
  const sourceFile = program.getSourceFile(fileName)!;
  const result = ts.transform(sourceFile, [factory]);
  const printer = ts.createPrinter();
  const output = printer.printFile(result.transformed[0]);
  result.dispose();
  return output;
}

describe("computeBehaviorMetadata", () => {
  it("detects classes with @WebdaBehavior JSDoc tag", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          secret: string;
        }
        class Plain {
          name: string;
        }
      `
    });

    const { behaviorClasses } = computeBehaviorMetadata(ts, program);
    expect(behaviorClasses.has("MFA")).toBe(true);
    expect(behaviorClasses.has("Plain")).toBe(false);
  });

  it("detects model attributes whose type is a Behavior class", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          secret: string;
        }
        class User {
          name: string;
          mfa: MFA;
          createdAt: Date;
        }
      `
    });

    const { modelBehaviorAttributes } = computeBehaviorMetadata(ts, program);
    const userAttrs = modelBehaviorAttributes.get("User");
    expect(userAttrs).toBeDefined();
    expect(userAttrs!.has("mfa")).toBe(true);
    expect(userAttrs!.has("name")).toBe(false);
    expect(userAttrs!.has("createdAt")).toBe(false);
    expect(userAttrs!.get("mfa")!.behaviorClassName).toBe("MFA");
  });

  it("ignores classes without Behavior-typed attributes", () => {
    const program = createTestProgram({
      "test.ts": `
        class User {
          name: string;
          createdAt: Date;
        }
      `
    });

    const { modelBehaviorAttributes } = computeBehaviorMetadata(ts, program);
    expect(modelBehaviorAttributes.has("User")).toBe(false);
  });

  it("populates importSource when Behavior is declared in another file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "behavior-test-"));
    try {
      const { program } = createDiskProgram(tmpDir, {
        "mfa.ts": `
          /** @WebdaBehavior */
          export class MFA {
            secret: string;
          }
        `,
        "user.ts": `
          import { MFA } from "./mfa";
          export class User {
            mfa: MFA;
          }
        `
      });

      const { modelBehaviorAttributes } = computeBehaviorMetadata(ts, program);
      const userAttrs = modelBehaviorAttributes.get("User");
      expect(userAttrs).toBeDefined();
      const info = userAttrs!.get("mfa")!;
      expect(info.behaviorClassName).toBe("MFA");
      // importSource is a relative path with .js extension
      expect(info.importSource).toBeDefined();
      expect(info.importSource).toMatch(/mfa\.js$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("createBehaviorTransformer", () => {
  it("returns a transformer factory", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
      `
    });
    const factory = createBehaviorTransformer(ts, program);
    expect(factory).toBeTypeOf("function");
  });

  it("Test 1: augments a @WebdaBehavior class with WEBDA_STORAGE, parent getter, and toJSON", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          secret: string;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    // [WEBDA_STORAGE] = {} property
    expect(output).toMatch(/\[WEBDA_STORAGE\]\s*=\s*\{\s*\}/);
    // get parent() { return this[WEBDA_STORAGE]["__parent__"]; }
    expect(output).toMatch(/get\s+parent\s*\(\s*\)/);
    expect(output).toContain(`"${BEHAVIOR_PARENT_KEY}"`);
    // toJSON() with WEBDA_STORAGE filter
    expect(output).toMatch(/toJSON\s*\(\s*\)/);
    // The parent slot key must be referenced from the `!== "__parent__"` filter in toJSON.
    const parentKeyOccurrences = (output.match(new RegExp(`"${BEHAVIOR_PARENT_KEY}"`, "g")) ?? []).length;
    expect(parentKeyOccurrences).toBeGreaterThanOrEqual(2);
    // WEBDA_STORAGE import injected
    expect(output).toContain("WEBDA_STORAGE");
    expect(output).toMatch(/import\s*\{[^}]*WEBDA_STORAGE/);
  });

  it("Test 2: leaves an author-defined toJSON intact and does NOT inject one", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          secret: string;
          toJSON() { return { authored: true }; }
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    // Author's toJSON body is preserved.
    expect(output).toContain("{ authored: true }");
    // No injected toJSON: only one occurrence of `toJSON(`.
    const occurrences = (output.match(/toJSON\s*\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("Test 3: parent getter returns this[WEBDA_STORAGE]['__parent__'] (returns undefined when unset)", () => {
    // Static check on the emitted body: the getter must return the storage slot,
    // which is `undefined` for a fresh instance with no prior assignment.
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
      `
    });

    const output = transformAndPrint(program, "test.ts");

    // The getter body must reference WEBDA_STORAGE and the parent slot key.
    expect(output).toMatch(
      new RegExp(`get\\s+parent\\s*\\(\\s*\\)\\s*\\{[\\s\\S]*?\\[WEBDA_STORAGE\\]\\[\\s*"${BEHAVIOR_PARENT_KEY}"\\s*\\]`)
    );
  });

  it("Test 4: a model with one Behavior attribute gains __hydrateBehaviors", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          secret: string;
        }
        class User {
          mfa: MFA;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    expect(output).toContain("__hydrateBehaviors");
    expect(output).toMatch(/instanceof\s+MFA/);
    expect(output).toMatch(/new\s+MFA\s*\(\s*\)/);
    expect(output).toContain('"mfa"');
    expect(output).toContain(`"${BEHAVIOR_PARENT_KEY}"`);
    // The parent slot is written with the { instance, attribute } shape.
    expect(output).toMatch(/instance:\s*this/);
    expect(output).toMatch(/attribute:\s*"mfa"/);
  });

  it("Test 5: a model with TWO Behavior attributes handles both", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
        /** @WebdaBehavior */
        class Audit {}
        class User {
          mfa: MFA;
          audit: Audit;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    expect(output).toContain("__hydrateBehaviors");
    expect(output).toMatch(/instanceof\s+MFA/);
    expect(output).toMatch(/instanceof\s+Audit/);
    expect(output).toMatch(/new\s+MFA\s*\(/);
    expect(output).toMatch(/new\s+Audit\s*\(/);
    expect(output).toMatch(/attribute:\s*"mfa"/);
    expect(output).toMatch(/attribute:\s*"audit"/);
  });

  it("Test 6: same Behavior class on TWO attributes emits two distinct coercion blocks", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
        class User {
          primaryMfa: MFA;
          backupMfa: MFA;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    expect(output).toContain("__hydrateBehaviors");
    expect(output).toMatch(/attribute:\s*"primaryMfa"/);
    expect(output).toMatch(/attribute:\s*"backupMfa"/);
    // Two `instanceof MFA` checks — one per attribute.
    const instanceofCount = (output.match(/instanceof\s+MFA/g) ?? []).length;
    expect(instanceofCount).toBe(2);
  });

  it("Test 7: a model with no Behavior attributes does NOT gain __hydrateBehaviors", () => {
    const program = createTestProgram({
      "test.ts": `
        class Plain {
          name: string;
          createdAt: Date;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    expect(output).not.toContain("__hydrateBehaviors");
  });

  it("Test 8: imports the Behavior class when it lives in another file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "behavior-test-"));
    try {
      const { program } = createDiskProgram(tmpDir, {
        "mfa.ts": `
          /** @WebdaBehavior */
          export class MFA {
            secret: string;
          }
        `,
        "user.ts": `
          import { MFA } from "./mfa";
          export class User {
            mfa: MFA;
          }
        `
      });

      const factory = createBehaviorTransformer(ts, program);
      const sourceFile = program.getSourceFile(path.join(tmpDir, "user.ts"))!;
      const result = ts.transform(sourceFile, [factory]);
      const printer = ts.createPrinter();
      const output = printer.printFile(result.transformed[0]);
      result.dispose();

      expect(output).toContain("__hydrateBehaviors");
      // Since TS would elide the type-only `MFA` import, the transformer must
      // re-inject a value-position import. Either the original import survives
      // or a fresh import statement was added — verify MFA appears in some
      // import declaration that resolves to the mfa file.
      expect(output).toMatch(/import\s*\{[^}]*MFA[^}]*\}\s*from\s*["']\.\/mfa(\.js)?["']/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not inject a duplicate __hydrateBehaviors when one is author-defined", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
        class User {
          mfa: MFA;
          __hydrateBehaviors() { /* author's own */ }
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    const occurrences = (output.match(/__hydrateBehaviors\s*\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("does not inject a duplicate parent getter when one is author-defined", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          get parent() { return undefined; }
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    const occurrences = (output.match(/get\s+parent\s*\(/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("does not duplicate WEBDA_STORAGE init when class already declares it", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {
          [WEBDA_STORAGE]: any = {};
          secret: string;
        }
      `
    });

    const output = transformAndPrint(program, "test.ts");

    const occurrences = (output.match(/\[WEBDA_STORAGE\]\s*[:=]/g) ?? []).length;
    // Only the author's declaration — the transformer didn't add a second one.
    expect(occurrences).toBe(1);
  });

  it("runtime: parent getter returns undefined on a fresh Behavior instance", () => {
    // We compile the snippet, eval it under Node, and verify behaviour.
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaBehavior */
        class MFA {}
      `
    });

    const factory = createBehaviorTransformer(ts, program);
    const sourceFile = program.getSourceFile("test.ts")!;
    const result = ts.transform(sourceFile, [factory]);
    const printer = ts.createPrinter();
    let output = printer.printFile(result.transformed[0]);
    result.dispose();

    // Drop the WEBDA_STORAGE import — we'll define a stub locally so the
    // generated code compiles with no external module loader.
    output = output.replace(/^\s*import\s*\{[^}]*WEBDA_STORAGE[^}]*\}[^;]*;?\s*$/m, "");

    const wrapped = `
      const WEBDA_STORAGE = "WEBDA_STORAGE";
      ${output}
      return new MFA();
    `;
     
    const fn = new Function(wrapped);
    const instance = fn();
    expect(instance.parent).toBeUndefined();
  });

  it("does not transform unrelated classes", () => {
    const program = createTestProgram({
      "test.ts": `
        class Other {
          name: string;
          method() { return 1; }
        }
      `
    });
    const output = transformAndPrint(program, "test.ts");
    expect(output).not.toContain("__hydrateBehaviors");
    expect(output).not.toMatch(/get\s+parent\s*\(/);
    expect(output).not.toContain(BEHAVIOR_PARENT_KEY);
  });
});
