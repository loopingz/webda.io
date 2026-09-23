import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassDeclaration } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { openSession, type Session } from "./context.ts";
import {
  buildBehaviorActions,
  buildCapabilities,
  buildCommands,
  generateWebdaModule,
  getPlural,
  sortObject
} from "./module.ts";
import { namespaceOf } from "./schema/project.ts";
import { handle } from "./schema/worker.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const fixture = join(here, "..", "test", "module-fixture");

/**
 * Find a class in an open session.
 * @param session - the session
 * @param file - file name suffix
 * @param name - class name
 * @returns the declaration
 */
function classOf(session: Session, file: string, name: string): ClassDeclaration {
  const sf = session.ctx.sourceFiles.find(f => f.fileName.endsWith(file));
  const cls = sf?.statements.find((s): s is ClassDeclaration => is.isClassDeclaration(s) && s.name?.text === name);
  if (!cls) throw new Error(`${name} not found in ${file}`);
  return cls;
}

describe("module helpers", () => {
  it("pluralises like @webda/compiler", () => {
    expect(["Key", "City", "Knife", "Leaf", "Criterion", "Analysis", "Woman", "Box", "Hero", "Bus", "User"].map(getPlural)).toEqual([
      "Keys",
      "Cities",
      "Knives",
      "Leaves",
      "Criteria",
      "Analyses",
      "Women",
      "Boxes",
      "Heroes",
      "Buses",
      "Users"
    ]);
  });

  it("sorts like JSONUtils.sortObject: code-unit order, falsy values dropped", () => {
    const sorted = sortObject({ b: 1, a: 2, B: 3, c: 0 }, v => (v ? v * 10 : 0));
    expect(Object.keys(sorted)).toEqual(["B", "a", "b"]);
    expect(sorted).toEqual({ B: 30, a: 20, b: 10 });
  });
});

describe("module metadata on a fixture", () => {
  let session: Session;
  beforeAll(() => {
    session = openSession(join(fixture, "tsconfig.json"), fixture);
  });
  afterAll(() => session?.dispose());

  it("extracts @Command and @BuildCommand definitions", () => {
    const commands = buildCommands(session.ctx, classOf(session, "commands.service.ts", "Tooling"));
    expect(Object.keys(commands)).toEqual(["greet", "build", "nameless-phase"]);
    expect(commands.greet).toEqual({
      description: "Say hello",
      method: "greet",
      requires: ["router", "store"],
      phase: "initialized",
      args: {
        name: { type: "string", required: true, alias: "n", description: "Name to greet" },
        times: { type: "number", default: 2 },
        loud: { type: "boolean" },
        polite: { type: "boolean", default: false, deprecated: "" },
        tag: { type: "string", default: "a" }
      }
    });
    // `phase` is pinned on @BuildCommand, and ignored when not a known value.
    expect(commands.build).toEqual({ description: "Build it", method: "build", args: {}, phase: "resolved" });
    expect(commands["nameless-phase"]).toEqual({ description: "", method: "other", args: {} });
    // Key order of an argument follows the TypeScript 6 assignment order.
    expect(Object.keys(commands.greet.args.name)).toEqual(["type", "required", "alias", "description"]);
    expect(Object.keys(commands.greet)).toEqual(["description", "method", "args", "requires", "phase"]);
  });

  it("collects @WebdaCapability from heritage clauses, sorted and first token only", () => {
    expect(buildCapabilities(session.ctx, classOf(session, "commands.service.ts", "Tooling"))).toEqual([
      "cache",
      "request-filter"
    ]);
    expect(buildCapabilities(session.ctx, classOf(session, "commands.service.ts", "Base"))).toEqual([]);
  });

  it("extracts Behavior actions, inherited ones included", () => {
    const audited = buildBehaviorActions(session.ctx, classOf(session, "behaviors.ts", "Audited"), "Webda/Audited");
    expect(audited).toEqual({
      read: { description: "Read", summary: "S", rest: { route: "{id}", method: "GET" } },
      write: {},
      bare: {}
    });
    const named = buildBehaviorActions(session.ctx, classOf(session, "behaviors.ts", "Named"), "Custom/Named");
    expect(Object.keys(named)).toEqual(["own", "read", "write", "bare"]);
    expect(named.own).toEqual({});
  });

  it("rejects static and global Behavior actions", () => {
    expect(() =>
      buildBehaviorActions(session.ctx, classOf(session, "behaviors.ts", "WithStatic"), "Webda/WithStatic")
    ).toThrow(/static @Action methods are not allowed \(method "forbidden"\)/);
    expect(() =>
      buildBehaviorActions(session.ctx, classOf(session, "behaviors.ts", "WithGlobal"), "Webda/WithGlobal")
    ).toThrow(/global: true \}\) is not allowed/);
  });

  it("assembles behaviours into the module and reports errors instead of throwing", () => {
    const { module, errors, namingViolations } = generateWebdaModule(session.ctx, {
      appPath: fixture,
      rootDir: join(fixture, "src"),
      outDir: join(fixture, "lib"),
      namespace: "Fixture"
    });
    expect(Object.keys(module)).toEqual([
      "$schema",
      "beans",
      "deployers",
      "moddas",
      "models",
      "schemas",
      "behaviors",
      "capabilities"
    ]);
    expect(module.capabilities).toBeUndefined();
    expect(Object.keys(module.behaviors)).toEqual(["Fixture/Audited", "Custom/Named"]);
    expect(module.behaviors["Custom/Named"]).toEqual({
      Identifier: "Custom/Named",
      Import: "lib/behaviors:Named",
      Actions: { own: {}, read: { description: "Read", summary: "S", rest: { route: "{id}", method: "GET" } }, write: {}, bare: {} }
    });
    expect(errors).toHaveLength(2);
    // Nothing here extends @webda/core or @webda/models.
    expect(namingViolations).toEqual([]);
  });
});

/**
 * Committed module of a package, when its dependencies are installed.
 * @param relative - repo-relative package directory
 * @returns the parsed module, or undefined to skip
 */
function committedModule(relative: string): any {
  const root = join(repo, relative);
  if (!existsSync(join(root, "node_modules")) || !existsSync(join(root, "webda.module.json"))) return undefined;
  return JSON.parse(readFileSync(join(root, "webda.module.json"), "utf8"));
}

/**
 * The generated module against the committed artefact, by section. The
 * committed files are written by the TypeScript 6 generator, so matching them
 * is evidence for the port rather than a restatement of it.
 */
describe.each([["sample-app"], ["sample-apps/blog-system"], ["packages/core"]])("module for %s", relative => {
  const root = join(repo, relative);
  const committed = committedModule(relative);
  let result: ReturnType<typeof generateWebdaModule> | undefined;
  beforeAll(() => {
    if (!committed) return;
    const session = openSession(join(root, "tsconfig.json"), root);
    try {
      result = generateWebdaModule(session.ctx, { appPath: root, namespace: namespaceOf(root) });
    } finally {
      session.dispose();
    }
  }, 120_000);

  it("matches model Actions, Events and PrimaryKey", () => {
    if (!committed) return;
    for (const [name, entry] of Object.entries<any>(committed.models)) {
      const got = result!.module.models[name];
      expect(JSON.stringify(got.Actions), `${name} Actions`).toBe(JSON.stringify(entry.Actions));
      expect(JSON.stringify(got.Events), `${name} Events`).toBe(JSON.stringify(entry.Events));
      expect(JSON.stringify(got.PrimaryKey), `${name} PrimaryKey`).toBe(JSON.stringify(entry.PrimaryKey));
    }
  });

  it("matches service commands, capabilities and Configuration", () => {
    if (!committed) return;
    for (const section of ["moddas", "beans"] as const) {
      for (const [name, entry] of Object.entries<any>(committed[section])) {
        const got: any = result!.module[section][name];
        expect(JSON.stringify(got.commands), `${name} commands`).toBe(JSON.stringify(entry.commands));
        expect(got.capabilities, `${name} capabilities`).toEqual(entry.capabilities);
        expect(got.Configuration, `${name} Configuration`).toBe(entry.Configuration);
      }
    }
  });

  it("matches behaviors and top-level capabilities", () => {
    if (!committed) return;
    expect(JSON.stringify(result!.module.behaviors)).toBe(JSON.stringify(committed.behaviors));
    expect(result!.module.capabilities).toEqual(committed.capabilities);
  });

  it("is byte-identical apart from sourceDigest", () => {
    if (!committed) return;
    const { sourceDigest, ...rest } = committed;
    void sourceDigest;
    expect(JSON.stringify(result!.module, undefined, 2)).toBe(JSON.stringify(rest, undefined, 2));
    expect(result!.errors).toEqual([]);
    expect(result!.namingViolations).toEqual([]);
  });
});

describe("worker module request", () => {
  it("answers a module request alongside the other kinds", () => {
    const response = handle({
      project: fixture,
      requests: [
        { id: "m", kind: "module", file: "", className: "" },
        { id: "missing", kind: "service", file: join(fixture, "src", "behaviors.ts"), className: "Nope" }
      ]
    });
    const result: any = response.results.m;
    expect(result.module.$schema).toBe("https://webda.io/schemas/webda.module.v4.json");
    expect(Object.keys(result.module.behaviors)).toContain("Custom/Named");
    expect(Array.isArray(result.namingViolations)).toBe(true);
    expect(response.errors.missing).toMatch(/not found/);
  });
});
