import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClassDeclaration, MethodDeclaration } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { openSession, type Session } from "./context.ts";
import {
  buildBehaviorActions,
  buildModelAliases,
  buildCapabilities,
  buildModelActions,
  buildModelPrimaryKey,
  buildModelPrimaryKeySeparator,
  buildModelShared,
  buildCommands,
  generateWebdaModule,
  getPlural,
  sortObject
} from "./module.ts";
import { buildRelations } from "./module-discovery.ts";
import { actionNameOption, namespaceOf } from "./schema/project.ts";
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
    expect(
      ["Key", "City", "Knife", "Leaf", "Criterion", "Analysis", "Woman", "Box", "Hero", "Bus", "User"].map(getPlural)
    ).toEqual([
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

  it("records @Shared methods with their source and allowlisted imports", () => {
    const { methods, errors } = buildModelShared(session.ctx, classOf(session, "shared.ts", "Invoice"), {
      modelName: "Fixture/Invoice",
      sharedImports: ["./helpers.js"]
    });
    expect(errors).toEqual([]);
    expect(Object.keys(methods)).toEqual([
      "isOverdue",
      "total",
      "minimum",
      "label",
      "withType",
      "toProxy",
      "sortByDue",
      "shorthand"
    ]);
    expect(methods.isOverdue).toEqual({
      source:
        "isOverdue(now: Date = new Date()): boolean {\n" +
        '    const late = this.status === "open" && this.due.getTime() < now.getTime();\n' +
        "    return late && this.total() > Math.max(0, Invoice.minimum());\n" +
        "  }"
    });
    expect(methods.minimum).toEqual({ static: true, source: "static minimum(): number {\n    return 0;\n  }" });
    expect(methods.label.imports).toEqual({ "./helpers.js": ["formatDate"] });
    expect(methods.withType.imports).toEqual({ "./helpers.js": ["Money"] });
    expect(methods.sortByDue.static).toBe(true);
    expect(methods.toProxy.imports).toBeUndefined();
    // The decorator is stripped, the JSDoc with it
    expect(methods.isOverdue.source.startsWith("isOverdue(")).toBe(true);
  });

  it("fails an impure @Shared method with the offending identifier and module", () => {
    const { methods, errors } = buildModelShared(session.ctx, classOf(session, "shared.ts", "Impure"), {
      modelName: "Fixture/Impure",
      sharedImports: ["./helpers.js"]
    });
    expect(Object.keys(methods)).toHaveLength(7);
    expect(errors).toEqual([
      `Fixture/Impure.usesContext is @Shared but references 'useContext' from "./decorators.js"`,
      "Fixture/Impure.usesLocal is @Shared but references 'helper' declared in src/shared.ts",
      "Fixture/Impure.usesLocal is @Shared but references 'RATE' declared in src/shared.ts",
      "Fixture/Impure.usesSave is @Shared but references 'this.save()' which is not @Shared",
      "Fixture/Impure.usesAction is @Shared but references 'this.action()' which is not @Shared",
      "Fixture/Impure.usesUnknownStatic is @Shared but references 'Impure.nope()' which is not @Shared",
      "Fixture/Impure.usesSuper is @Shared but references 'super'",
      "Fixture/Impure.usesUnresolved is @Shared but references 'notDeclaredAnywhere' which cannot be resolved"
    ]);
    // A module outside the allowlist is named
    const strict = buildModelShared(session.ctx, classOf(session, "shared.ts", "Invoice"), {
      modelName: "Fixture/Invoice",
      sharedImports: []
    });
    expect(strict.errors).toEqual([
      `Fixture/Invoice.label is @Shared but references 'formatDate' from "./helpers.js"`,
      `Fixture/Invoice.withType is @Shared but references 'Money' from "./helpers.js"`
    ]);
  });

  it("accepts default, renamed and namespace imports, accessors, parameter properties and labels", () => {
    const { methods, errors } = buildModelShared(session.ctx, classOf(session, "shared-edge.ts", "Edges"), {
      modelName: "Fixture/Edges",
      sharedImports: ["./helpers.js", "./default.js"]
    });
    expect(Object.keys(methods)).toEqual(["imports", "members", "locals", "impure"]);
    // A qualified type name (`helpers.Money`) is the namespace import
    expect(methods.imports.imports).toEqual({
      "./default.js": ["default as fixtureDefault"],
      "./helpers.js": ["* as helpers", "formatDate as fmt"]
    });
    // No return type annotation, and a parameter decorator is not a reference
    expect(methods.imports.source.startsWith("imports(money: helpers.Money) {")).toBe(true);
    expect(methods.members.imports).toBeUndefined();
    // Only `impure` fails: getter, setter, parameter property, a local type,
    // `undefined` and labels are all allowed
    expect(errors).toEqual([
      "Fixture/Edges.impure is @Shared but references 'this.missing' which is not declared on the model",
      `Fixture/Edges.impure is @Shared but references 'Day' from "an unknown module"`,
      // Named like a standard library file, but not shipped by typescript
      "Fixture/Edges.impure is @Shared but references 'FIXTURE_GLOBAL' declared in src/globals/lib.fixture.d.ts",
      `Fixture/Edges.impure is @Shared but references 'process' from "@types/node"`
    ]);
  });

  it("rejects index-signature members and reads anonymous classes", () => {
    expect(
      buildModelShared(session.ctx, classOf(session, "shared-edge.ts", "Indexed"), {
        modelName: "Fixture/Indexed",
        sharedImports: []
      }).errors
    ).toEqual([
      "Fixture/Indexed.dynamic is @Shared but references 'this.anything' which is neither an attribute nor a @Shared method"
    ]);
    const sf = session.ctx.sourceFiles.find(f => f.fileName.endsWith("shared-edge.ts"))!;
    const anonymous = sf.statements.find((s): s is ClassDeclaration => is.isClassDeclaration(s) && !s.name)!;
    expect(buildModelShared(session.ctx, anonymous, { modelName: "Fixture/Default", sharedImports: [] })).toEqual({
      methods: { anonymous: { source: "anonymous(): number {\n    return 1;\n  }" } },
      errors: []
    });
  });

  it("keys model actions by the @Action name option and records the method as handler", () => {
    expect(buildModelActions(session.ctx, classOf(session, "actions.ts", "Jobs"))).toEqual({
      status: { description: "Report", handler: "statusAction" },
      run: {},
      same: {},
      lookup: { global: true, handler: "find" }
    });
  });

  it("reads the @Action/@Operation name option only when it is a non-empty string literal", () => {
    const cls = classOf(session, "actions.ts", "ActionNames");
    const names = Object.fromEntries(
      cls.members
        .filter((m): m is MethodDeclaration => is.isMethodDeclaration(m))
        .map(m => [(m.name as { text: string }).text, actionNameOption(m)])
    );
    expect(names).toEqual({
      named: "named",
      operation: "viaOperation",
      noArgument: undefined,
      notAnObject: undefined,
      noName: undefined,
      computedName: undefined,
      emptyName: undefined,
      otherDecorators: undefined,
      undecorated: undefined,
      modifierOnly: undefined
    });
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
      Actions: {
        own: {},
        read: { description: "Read", summary: "S", rest: { route: "{id}", method: "GET" } },
        write: {},
        bare: {}
      }
    });
    expect(errors).toHaveLength(2);
    // Nothing here extends @webda/core or @webda/models.
    expect(namingViolations).toEqual([]);
  });
});

describe("module with a duplicated name", () => {
  it("reports both classes instead of letting the last one win silently", () => {
    const dir = join(here, "..", "test", "duplicate-fixture");
    const session = openSession(join(dir, "tsconfig.json"), dir);
    try {
      const { errors } = generateWebdaModule(session.ctx, {
        appPath: dir,
        rootDir: join(dir, "src"),
        outDir: join(dir, "lib"),
        namespace: "Dup"
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(
        /^Dup\/Twice is declared twice: First in .*first\.model\.ts and Second in .*second\.model\.ts; rename one$/
      );
    } finally {
      session.dispose();
    }
  });
});

describe("module model aliases", () => {
  it("collects every @WebdaAlias, completes the namespace and refuses an alias naming another model", () => {
    const dir = join(here, "..", "test", "alias-fixture");
    const session = openSession(join(dir, "tsconfig.json"), dir);
    try {
      const { module, errors } = generateWebdaModule(session.ctx, {
        appPath: dir,
        rootDir: join(dir, "src"),
        outDir: join(dir, "lib"),
        namespace: "Garden"
      });
      expect(module.models["Garden/Plant"].Aliases).toEqual(["Garden/Flora", "Legacy/Greenery"]);
      // No tag, no key: committed modules stay byte-identical
      expect(module.models["Garden/Tree"]).not.toHaveProperty("Aliases");
      expect(module.models["Garden/Shrub"].Aliases).toEqual(["Garden/Tree"]);
      expect(errors.filter(error => error.includes("@WebdaAlias"))).toEqual([
        "Garden/Shrub: @WebdaAlias Garden/Tree is the identifier of another model"
      ]);
      expect(buildModelAliases(classOf(session, "garden.model.ts", "Tree"), "Garden")).toEqual([]);
    } finally {
      session.dispose();
    }
  });
});

describe("module events under strict", () => {
  it("lists the events of an optional [WEBDA_EVENTS]? member", () => {
    // `strict: true` widens `[WEBDA_EVENTS]?: ModelEvents<this>` to `ModelEvents<this> | undefined`,
    // whose union has no properties of its own: Events used to come out empty
    const dir = join(here, "..", "test", "events-fixture");
    const session = openSession(join(dir, "tsconfig.json"), dir);
    try {
      const { module, errors } = generateWebdaModule(session.ctx, {
        appPath: dir,
        rootDir: join(dir, "src"),
        outDir: join(dir, "lib"),
        namespace: "Evt"
      });
      expect(errors).toEqual([]);
      expect(module.models["Evt/Inherited"].Events).toEqual(["Created", "Deleted"]);
      expect(module.models["Evt/Extended"].Events).toEqual(["Created", "Deleted", "Archived"]);
    } finally {
      session.dispose();
    }
  });
});

describe("module relations", () => {
  const dir = join(here, "..", "test", "relation-fixture");
  let session: Session;
  let result: ReturnType<typeof generateWebdaModule>;
  beforeAll(() => {
    session = openSession(join(dir, "tsconfig.json"), dir);
    result = generateWebdaModule(session.ctx, {
      appPath: dir,
      rootDir: join(dir, "src"),
      outDir: join(dir, "lib"),
      namespace: "Rel"
    });
  }, 120_000);
  afterAll(() => session?.dispose());

  it("records the relation aliases as the relation type they resolve to", () => {
    expect(result.module.models["Rel/Post"].Relations).toEqual({
      parent: { attribute: "author", model: "Rel/Author" },
      links: [
        { attribute: "editor", model: "Rel/Author", type: "LINK" },
        { attribute: "reviewer", model: "Rel/Author", type: "LINK" },
        { attribute: "sponsor", model: "Rel/Author", type: "LINK" },
        { attribute: "tags", model: "Rel/Tag", type: "LINKS_ARRAY" },
        { attribute: "labels", model: "Rel/Tag", type: "LINKS_ARRAY" },
        { attribute: "related", model: "Rel/Post", type: "LINKS_SIMPLE_ARRAY" }
      ]
    });
    // The same in the discovery helper
    const relations = buildRelations(
      session.ctx,
      undefined,
      classOf(session, "blog.model.ts", "Post"),
      name => `Rel/${name}`
    );
    expect(relations.parent).toEqual({ attribute: "author", model: "Rel/Author" });
    expect(relations.links?.map(link => link.type)).toEqual([
      "LINK",
      "LINK",
      "LINK",
      "LINKS_ARRAY",
      "LINKS_ARRAY",
      "LINKS_SIMPLE_ARRAY"
    ]);
  });

  it("binds a link declared on a generic base to the subclass type argument", () => {
    expect(result.module.models["Rel/Owned"].Relations.links).toEqual([
      { attribute: "owner", type: "LINK" },
      { attribute: "reader", type: "LINK" }
    ]);
    expect(result.module.models["Rel/Draft"].Relations.links).toEqual([
      { attribute: "owner", model: "Rel/Author", type: "LINK" },
      { attribute: "reader", model: "Rel/Author", type: "LINK" }
    ]);
    // The same in the discovery helper
    const resolve = (model: string) => (model === "Author" ? "Rel/Author" : undefined);
    const linksOf = (name: string) =>
      buildRelations(session.ctx, undefined, classOf(session, "owned.model.ts", name), resolve).links;
    expect(linksOf("Owned")).toEqual([
      { attribute: "owner", type: "LINK" },
      { attribute: "reader", type: "LINK" }
    ]);
    expect(linksOf("Draft")).toEqual([
      { attribute: "owner", model: "Rel/Author", type: "LINK" },
      { attribute: "reader", model: "Rel/Author", type: "LINK" }
    ]);
  });

  it("records the attribute a ModelRelated queries", () => {
    expect(result.module.models["Rel/Author"].Relations.queries).toEqual([
      { attribute: "posts", model: "Rel/Post", targetAttribute: "author" }
    ]);
    expect(result.module.models["Rel/Tag"].Relations.queries).toEqual([
      { attribute: "posts", model: "Rel/Post", targetAttribute: "tags" },
      { attribute: "untargeted", model: "Rel/Post" }
    ]);
    expect(
      buildRelations(session.ctx, undefined, classOf(session, "blog.model.ts", "Tag"), name => `Rel/${name}`).queries
    ).toEqual([
      { attribute: "posts", model: "Rel/Post", targetAttribute: "tags" },
      { attribute: "untargeted", model: "Rel/Post", targetAttribute: "" }
    ]);
  });

  it("refuses a second parent", () => {
    expect(result.errors).toEqual([
      "Rel/Comment has two parents, post and thread: a model has one ModelParent (BelongTo) at most, use ModelLink " +
        "(ManyToOne) for the other"
    ]);
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
      expect(JSON.stringify(got.Shared), `${name} Shared`).toBe(JSON.stringify(entry.Shared));
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

  it("is byte-identical to the committed module", () => {
    if (!committed) return;
    expect(JSON.stringify(result!.module, undefined, 2)).toBe(JSON.stringify(committed, undefined, 2));
    expect(result!.errors).toEqual([]);
    expect(result!.namingViolations).toEqual([]);
  });

  it.runIf(relative === "packages/core")("binds a link declared on a generic base to the subclass argument", () => {
    if (!committed) return;
    const linksOf = (model: string) => result!.module.models[model].Relations.links;
    expect(linksOf("Webda/AbstractOwnerModel")).toEqual([{ attribute: "_user", type: "LINK" }]);
    expect(linksOf("Webda/OwnerModel")).toEqual([{ attribute: "_user", model: "Webda/User", type: "LINK" }]);
  });
});

/**
 * A model extending a model from a dependency package: hawk's `ApiKey` extends
 * `@webda/core`'s `OwnerModel`. The dependency's models are not local, so their
 * names come from its `webda.module.json`, and the relations they declare come
 * from its declaration files.
 */
describe("model extending a dependency's model", () => {
  const root = join(repo, "packages/hawk");
  const available = existsSync(join(root, "node_modules")) && existsSync(join(repo, "packages/core/webda.module.json"));
  let result: ReturnType<typeof generateWebdaModule> | undefined;
  beforeAll(() => {
    if (!available) return;
    const session = openSession(join(root, "tsconfig.json"), root);
    try {
      result = generateWebdaModule(session.ctx, { appPath: root, namespace: namespaceOf(root) });
    } finally {
      session.dispose();
    }
  }, 120_000);

  it("records the dependency's models as ancestors", () => {
    if (!available) return;
    expect(result!.module.models["Webda/ApiKey"].Ancestors).toEqual(["Webda/OwnerModel", "Webda/AbstractOwnerModel"]);
    expect(result!.errors).toEqual([]);
  });

  it("records relations inherited from the dependency's models", () => {
    if (!available) return;
    // `_user: ModelLink<T>` is declared on the generic base, `OwnerModel` binds `T` to `User`
    expect(result!.module.models["Webda/ApiKey"].Relations.links).toEqual([
      { attribute: "_user", model: "Webda/User", type: "LINK" }
    ]);
  });
});

/**
 * `@Action({ name })` on a model: async's `AsyncAction.statusAction` cannot be
 * a method called `status` (that is a property), so it is exposed under the
 * name option. The action, and its schemas, take the exposed name.
 */
describe("model action exposed under another name", () => {
  const root = join(repo, "packages/async");
  const available = existsSync(join(root, "node_modules")) && existsSync(join(repo, "packages/core/webda.module.json"));
  let result: ReturnType<typeof generateWebdaModule> | undefined;
  beforeAll(() => {
    if (!available) return;
    const session = openSession(join(root, "tsconfig.json"), root);
    try {
      result = generateWebdaModule(session.ctx, { appPath: root, namespace: namespaceOf(root) });
    } finally {
      session.dispose();
    }
  }, 120_000);

  it("records the action under its name, with the method as handler", () => {
    if (!available) return;
    expect(result!.module.models["Webda/AsyncAction"].Actions).toEqual({ status: { handler: "statusAction" } });
    expect(result!.errors).toEqual([]);
  });

  it("names the action schemas after the exposed name", () => {
    if (!available) return;
    const schemas = Object.keys(result!.module.schemas);
    expect(schemas).toContain("Webda/AsyncAction.status.input");
    expect(schemas).toContain("Webda/AsyncAction.status.output");
    expect(schemas.filter(name => name.includes(".statusAction."))).toEqual([]);
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

describe("module primary key separator", () => {
  it("inherits PrimaryKey and PrimaryKeySeparator from a parent model", () => {
    const dir = join(here, "..", "test", "separator-fixture");
    const session = openSession(join(dir, "tsconfig.json"), dir);
    try {
      for (const name of ["Keyed", "KeyedChild"]) {
        const cls = classOf(session, "keyed.model.ts", name);
        expect(buildModelPrimaryKey(session.ctx, cls), name).toEqual(["a", "b"]);
        expect(buildModelPrimaryKeySeparator(session.ctx, cls), name).toBe(":");
      }
      expect(buildModelPrimaryKeySeparator(session.ctx, classOf(session, "keyed.model.ts", "Plain"))).toBeUndefined();
    } finally {
      session.dispose();
    }
  });
});
