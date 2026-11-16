import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BEHAVIOR_PARENT_KEY, behaviorsGenerator } from "./generators/behaviors.ts";
import { ValueImports } from "./generators/imports.ts";
import { generateWebdaModule } from "./module.ts";
import { openSession } from "./context.ts";
import { WarmSession } from "./session.ts";
import { runTwoPass } from "./twopass.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");
const configFile = join(fixture, "tsconfig.json");

/**
 * Transform one fixture file through the resident session.
 * @param name - file name under src
 * @returns generated text
 */
function transform(name: string): string {
  const session = new WarmSession({
    configFile,
    cwd: fixture,
    storageModule: "./runtime.js",
    qlModule: "./runtime.js"
  });
  try {
    const file = join(fixture, "src", name);
    return session.transform(file, readFileSync(file, "utf8")).text;
  } finally {
    session.dispose();
  }
}

describe("behaviours", () => {
  it("augments a @WebdaBehavior class with storage, parent getter and toJSON", () => {
    const text = transform("mfa.behavior.model.ts");
    expect(text).toContain("[WEBDA_STORAGE]");
    expect(text).toMatch(/get parent\(\)/);
    expect(text).toContain(`[${JSON.stringify(BEHAVIOR_PARENT_KEY)}]`);
    // toJSON must drop the parent back-reference or serialisation cycles.
    expect(text).toMatch(new RegExp(`key !== ${JSON.stringify(BEHAVIOR_PARENT_KEY)}`));
  });

  it("never replaces an author-written toJSON", () => {
    const text = transform("mfa.behavior.model.ts");
    expect(text).toContain("return { authored: true };");
    // Audited keeps exactly one toJSON; MFA gains the generated one.
    expect((text.match(/toJSON\(\)/g) ?? []).length).toBe(2);
  });

  it("generates __hydrateBehaviors for Behaviour-typed properties", () => {
    const text = transform("holder.model.ts");
    expect(text).toMatch(/protected __hydrateBehaviors\(rawData\?: any\): void/);
    expect(text).toContain("if (!(v instanceof MFA))");
    expect(text).toMatch(/\{ instance: this, attribute: "mfa" \}/);
    expect(text).toContain("(Holder.prototype as any).__hydrateBehaviors?.call(this, rawData)");
    expect(text).toMatch(/\{ instance: this, attribute: "paymentMfa" \}/);
  });

  it("generates parameter schemas and exports for models, behaviors and inherited declarations", () => {
    const session = openSession(configFile, fixture);
    try {
      const { module } = generateWebdaModule(session.ctx, { appPath: fixture, namespace: "Fixture" });
      expect(module.behaviors["Fixture/MFA"].Schema.properties.lifetime.type).toBe("number");
      expect(module.behaviors["Fixture/MFA"].Configuration).toContain("MfaPolicy");
    } finally {
      session.dispose();
    }
    const modelRoot = join(here, "..", "test", "separator-fixture");
    const modelSession = openSession(join(modelRoot, "tsconfig.json"), modelRoot);
    try {
      const { module } = generateWebdaModule(modelSession.ctx, { appPath: modelRoot, namespace: "Fixture" });
      const model = module.models["Fixture/Keyed"];
      expect(model.Schema.properties.limit.type).toBe("number");
      expect(model.Configuration).toContain("KeyedParameters");
      expect(module.models["Fixture/KeyedChild"].Configuration).toBe(model.Configuration);
    } finally {
      modelSession.dispose();
    }
  });

  it("produces code that type-checks, which emit-time transforms never had to", () => {
    // The original ran after checking, so implicit-any indexing was invisible.
    // Generated source is checked like any other, and was not clean at first.
    const result = runTwoPass({
      configFile,
      rootDir: join(fixture, "src"),
      storageModule: "./runtime.js",
      qlModule: "./runtime.js"
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.editCounts.behaviors).toBeGreaterThan(0);
  });
});

describe("behaviours on a hand-written project", () => {
  let tmpDir: string;
  let session: ReturnType<typeof openSession>;
  let edits: Record<string, string[]>;

  beforeAll(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "content-mapper-behaviors-")));
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: false, types: [], module: "esnext", moduleResolution: "bundler", noEmit: true },
        include: ["src/**/*"]
      })
    );
    writeFileSync(
      join(tmpDir, "src", "impl.ts"),
      `/** @WebdaBehavior */\nexport class Impl {\n  value: string;\n}\n` +
        `/** @WebdaBehavior */\nclass Hidden {\n  value: string;\n}\n` +
        `export type Private = Hidden;\n`
    );
    // The class is re-exported, and reachable through an alias; `Hidden` only as a type
    writeFileSync(
      join(tmpDir, "src", "hub.ts"),
      `import { Impl } from "./impl";\nexport { Impl };\nexport type Alias = Impl;\n` +
        `export type { Private } from "./impl";\n`
    );
    writeFileSync(
      join(tmpDir, "src", "holder.ts"),
      `import "./impl";\nimport type { Alias, Private } from "./hub";\nimport type { Ghost } from "./missing";\n` +
        `export class Holder {\n  first: Alias;\n  second: Private;\n  third: Ghost;\n}\n`
    );
    writeFileSync(
      join(tmpDir, "src", "slots.ts"),
      `const WEBDA_STORAGE: unique symbol = Symbol("storage");\n` +
        `/** @WebdaBehavior */\nexport class Own {\n  [WEBDA_STORAGE]: Record<string, any> = {};\n` +
        `  get parent() {\n    return undefined;\n  }\n}\n` +
        `/** @WebdaBehavior */\nexport class Inherited extends Own {\n  extra: string;\n}\n` +
        `export class Manual {\n  own: Own;\n  protected __hydrateBehaviors(): void {}\n}\n`
    );
    session = openSession(join(tmpDir, "tsconfig.json"), tmpDir);
    edits = {};
    for (const file of behaviorsGenerator({ storageModule: "./runtime.js" }).analyze(session.ctx)) {
      edits[file.fileName.slice(join(tmpDir, "src").length + 1)] = file.edits.map(edit => edit.text);
    }
  });

  afterAll(() => {
    session.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not redeclare a storage slot the class declares or inherits", () => {
    const slots = edits["slots.ts"].join("\n");
    expect(slots).not.toContain("[WEBDA_STORAGE]: Record<string, any> = {};");
    // The file already binds WEBDA_STORAGE
    expect(slots).not.toContain("import { WEBDA_STORAGE }");
  });

  it("keeps an author-written parent getter", () => {
    // `Own` declares `parent`, `Inherited` does not
    expect(edits["slots.ts"].filter(text => text.includes("get parent()"))).toHaveLength(1);
    expect(edits["slots.ts"].filter(text => text.includes("toJSON() {"))).toHaveLength(2);
  });

  it("leaves an author-written __hydrateBehaviors alone", () => {
    expect(edits["slots.ts"].join("\n")).not.toContain("__hydrateBehaviors");
  });

  it("imports a behaviour class from the module its alias came from", () => {
    const holder = edits["holder.ts"];
    expect(holder).toContain(`import { Impl } from "./hub";\n`);
    expect(holder).toContain(`import { WEBDA_STORAGE } from "./runtime.js";\n`);
    expect(holder.join("\n")).toContain(`{ instance: this, attribute: "first" }`);
  });

  it("skips a behaviour-typed property whose class cannot be made a value", () => {
    const holder = edits["holder.ts"].join("\n");
    expect(holder).not.toContain(`attribute: "second"`);
    expect(holder).not.toContain("Hidden");
    expect(holder).not.toContain(`attribute: "third"`);
  });

  it("refuses names that are not identifiers or come from an unresolved module", () => {
    const sf = session.ctx.sourceFiles.find(file => file.fileName.endsWith("holder.ts"))!;
    const imports = new ValueImports(session.ctx, sf, "test");
    expect(imports.ensure("not-a-name", sf)).toBe(false);
    expect(imports.ensureType("Array<string>", sf)).toBe(false);
    // `Ghost` is imported from a module that does not resolve
    expect(imports.ensure("Phantom", sf, ["Ghost"])).toBe(false);
    expect(imports.ensureType("Phantom", sf, ["Ghost"])).toBe(false);
    expect(imports.collect()).toEqual([]);
  });
});
