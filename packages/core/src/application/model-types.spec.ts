import { suite, test } from "@webda/test";
import * as assert from "assert";
import { ModelTypeResolver, UuidModel, useTypeResolver } from "@webda/models";
import { WebdaApplicationTest } from "../test/application.js";
import { useApplication, useModel } from "./hooks.js";
import type { Application } from "./application.js";
import { UNTYPED, buildModelTypeResolver, classifyStoredType } from "./model-types.js";

class Animal extends UuidModel {}
class Dog extends Animal {}
(Animal as any).Metadata = { Identifier: "Zoo/Animal", Subclasses: [Dog], PrimaryKey: ["uuid"] };
(Dog as any).Metadata = { Identifier: "Zoo/Dog", Subclasses: [], PrimaryKey: ["uuid"] };
class ItemA extends UuidModel {}
class ItemB extends UuidModel {}
(ItemA as any).Metadata = { Identifier: "Zoo/Item", Subclasses: [] };
(ItemB as any).Metadata = { Identifier: "Zoo/ITEM", Subclasses: [] };

@suite
class ClassifyStoredTypeTest {
  resolver = buildModelTypeResolver({
    getModels: () => ({ "Zoo/Animal": Animal, "Zoo/Dog": Dog, "Zoo/Item": ItemA, "Zoo/ITEM": ItemB }),
    getNamespace: () => "Zoo"
  });

  @test
  classifies() {
    const r = this.resolver;
    assert.ok(r instanceof ModelTypeResolver);
    assert.strictEqual(r.namespace, "Zoo");
    assert.deepStrictEqual(classifyStoredType("Zoo/Animal", Animal, r), {
      kind: "current",
      from: "Zoo/Animal",
      to: "Zoo/Animal"
    });
    assert.deepStrictEqual(classifyStoredType("dog", Animal, r), { kind: "legacy", from: "dog", to: "Zoo/Dog" });
    assert.deepStrictEqual(classifyStoredType(undefined, Animal, r), {
      kind: "untyped",
      from: UNTYPED,
      to: "Zoo/Animal"
    });
    assert.deepStrictEqual(classifyStoredType(null, undefined, r), { kind: "untyped", from: UNTYPED });
    assert.deepStrictEqual(classifyStoredType("Gone/Thing", Animal, r), { kind: "unknown", from: "Gone/Thing" });
    assert.deepStrictEqual(classifyStoredType("item", Animal, r), {
      kind: "ambiguous",
      from: "item",
      candidates: ["Zoo/ITEM", "Zoo/Item"]
    });
  }
}

@suite
class ModelTypesApplicationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  installedWhenModelsLoad() {
    const resolver = useTypeResolver();
    assert.ok(resolver, "the application installs a resolver");
    assert.strictEqual(resolver!.namespace, "WebdaDemo");
    assert.strictEqual(resolver!.resolveStoredType("webda/user"), useModel("Webda/User"));
    // No WebdaDemo/Ident: Webda 3 completion falls back to Webda/
    assert.strictEqual(resolver!.resolveStoredType("Ident"), useModel("Webda/Ident"));
    assert.deepStrictEqual((useModel("Webda/User") as any).Metadata.Aliases, []);
  }

  @test
  rebuiltWhenAModelIsAdded() {
    const before = useTypeResolver();
    const FrameworkUser: any = useModel("Webda/User");
    class DemoUser extends FrameworkUser {}
    (useApplication() as Application).addModel("WebdaDemo/User", DemoUser, {
      Identifier: "WebdaDemo/User",
      Import: "",
      Plural: "Users",
      Schemas: {},
      Relations: {},
      Ancestors: ["Webda/User"],
      Subclasses: [],
      PrimaryKey: ["uuid"],
      Events: [],
      Reflection: {},
      Actions: {},
      Aliases: ["Legacy/Member"]
    });
    const after = useTypeResolver()!;
    assert.notStrictEqual(after, before);
    // The application namespace comes before Webda/
    assert.strictEqual(after.resolveStoredType("User"), DemoUser);
    assert.strictEqual(after.resolveStoredType("legacy/member"), DemoUser);
    assert.strictEqual(after.resolveStoredType("Webda/User"), FrameworkUser);
  }
}
