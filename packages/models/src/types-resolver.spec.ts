import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "./model.model.js";
import {
  ModelTypeResolver,
  acceptedTypes,
  belongsToModel,
  getTypeResolver,
  resolveStoredType,
  setTypeResolver,
  useTypeResolver
} from "./types-resolver.js";

/**
 * Stamp the runtime Metadata Application.setModelMetadata sets (Subclasses resolved to classes, direct only)
 * @param clazz - the class
 * @param Identifier - its identifier
 * @param Subclasses - its direct subclasses
 * @param Aliases - its @WebdaAlias names
 */
function stamp(clazz: any, Identifier: string, Subclasses: any[] = [], Aliases: string[] = []): void {
  clazz.Metadata = { Identifier, Subclasses, Aliases, PrimaryKey: ["uuid"] };
}

class Base extends UuidModel {}
class FwUser extends Base {}
class AppUser extends FwUser {}
class FwIdent extends Base {}
class Transaction extends Base {}
class Card extends Transaction {}
class Fee extends Card {}
class Extra extends Transaction {}
class ItemA extends Base {}
class ItemB extends Base {}
class Gadget extends Base {}
class Gizmo extends Base {}
class Keyed extends Base {}
stamp(FwUser, "Webda/User", [AppUser]);
stamp(AppUser, "MyApp/User");
stamp(FwIdent, "Webda/Ident");
stamp(Transaction, "MyApp/Transaction", [Card], ["Legacy/Payment", "MyApp/Payment"]);
stamp(Card, "MyApp/Card", [Fee]);
stamp(Fee, "MyApp/Fee");
// Extra extends Transaction but its parent metadata does not list it
stamp(Extra, "MyApp/Extra");
stamp(ItemA, "MyApp/Item");
stamp(ItemB, "MyApp/ITEM");
stamp(Gadget, "MyApp/Gadget", [], ["Shared/Widget"]);
stamp(Gizmo, "MyApp/Gizmo", [], ["Shared/Widget"]);
stamp(Keyed, "MyApp/Keyed");

const MODELS: Record<string, any> = {
  "Webda/User": FwUser,
  "MyApp/User": AppUser,
  "Webda/Ident": FwIdent,
  "MyApp/Transaction": Transaction,
  "MyApp/Card": Card,
  "MyApp/Fee": Fee,
  "MyApp/Extra": Extra,
  "MyApp/Item": ItemA,
  "MyApp/ITEM": ItemB,
  "MyApp/Gadget": Gadget,
  "MyApp/Gizmo": Gizmo,
  "MyApp/Keyed": Keyed,
  // A map key that is not the class identifier is an extra exact name
  "Legacy/Key": Keyed
};

@suite
class ModelTypeResolverTest {
  resolver = new ModelTypeResolver(MODELS, { namespace: "MyApp" });

  @test
  exactIdentifierIsCurrent() {
    assert.deepStrictEqual(this.resolver.resolve("MyApp/User"), {
      status: "current",
      model: AppUser,
      identifier: "MyApp/User"
    });
  }

  @test
  legacyForms() {
    const cases: [string, any][] = [
      ["User", AppUser],
      ["user", AppUser],
      ["webda/user", FwUser],
      ["WEBDA/USER", FwUser],
      ["Ident", FwIdent],
      ["ident", FwIdent],
      ["myapp/transaction", Transaction],
      ["Transaction", Transaction],
      ["Legacy/Payment", Transaction],
      ["legacy/payment", Transaction],
      // The short name of a renamed model
      ["Payment", Transaction],
      ["fee", Fee],
      ["Legacy/Key", Keyed]
    ];
    for (const [stored, model] of cases) {
      const resolution = this.resolver.resolve(stored);
      assert.strictEqual(resolution.status, "legacy", stored);
      assert.strictEqual(resolution.model, model, stored);
      assert.strictEqual(resolution.identifier, model.Metadata.Identifier, stored);
    }
  }

  @test
  ambiguousIsNeverGuessed() {
    const items = { status: "ambiguous", candidates: ["MyApp/ITEM", "MyApp/Item"] };
    assert.deepStrictEqual(this.resolver.resolve("myapp/item"), items);
    assert.deepStrictEqual(this.resolver.resolve("item"), items);
    assert.deepStrictEqual(this.resolver.resolve("Shared/Widget"), {
      status: "ambiguous",
      candidates: ["MyApp/Gadget", "MyApp/Gizmo"]
    });
    assert.strictEqual(this.resolver.resolveStoredType("shared/widget"), undefined);
    // The exact identifier still wins
    assert.strictEqual(this.resolver.resolveStoredType("MyApp/Item"), ItemA);
  }

  @test
  unknownTypes() {
    for (const stored of ["Gone/Thing", "Thing", ""]) {
      assert.deepStrictEqual(this.resolver.resolve(stored), { status: "unknown" }, stored);
    }
  }

  @test
  acceptedTypesCoverTransitiveSubclasses() {
    assert.deepStrictEqual(this.resolver.acceptedTypes(Transaction), [
      "MyApp/Transaction",
      "Transaction",
      "myapp/transaction",
      "transaction",
      "Legacy/Payment",
      "Payment",
      "legacy/payment",
      "payment",
      "MyApp/Payment",
      "myapp/payment",
      "MyApp/Card",
      "Card",
      "myapp/card",
      "card",
      "MyApp/Fee",
      "Fee",
      "myapp/fee",
      "fee",
      "MyApp/Extra",
      "Extra",
      "myapp/extra",
      "extra"
    ]);
    // "User" and "user" resolve to the application model, not to the framework one
    assert.deepStrictEqual(this.resolver.acceptedTypes(FwUser), [
      "Webda/User",
      "webda/user",
      "MyApp/User",
      "User",
      "myapp/user",
      "user"
    ]);
    assert.deepStrictEqual(this.resolver.acceptedTypes(AppUser), ["MyApp/User", "User", "myapp/user", "user"]);
  }

  @test
  identifiersOfIsTransitive() {
    assert.deepStrictEqual(this.resolver.identifiersOf(Transaction), [
      "MyApp/Transaction",
      "MyApp/Card",
      "MyApp/Fee",
      "MyApp/Extra"
    ]);
  }

  @test
  belongsToModel() {
    const r = this.resolver;
    assert.strictEqual(r.belongsToModel(Transaction, "fee"), true);
    assert.strictEqual(r.belongsToModel(Transaction, "MyApp/Extra"), true);
    assert.strictEqual(r.belongsToModel(Transaction, "User"), false);
    assert.strictEqual(r.belongsToModel(Card, "MyApp/Transaction"), false);
    assert.strictEqual(r.belongsToModel(Transaction, "Gone/Thing"), false);
    assert.strictEqual(r.belongsToModel(Transaction, "item"), false);
    // Untyped rows belong to the table root and its ancestors
    assert.strictEqual(r.belongsToModel(Transaction, undefined, Transaction), true);
    assert.strictEqual(r.belongsToModel(Base, undefined, Transaction), true);
    assert.strictEqual(r.belongsToModel(Card, undefined, Transaction), false);
    // Without a known table root, untyped rows stay visible (repositories built outside a store)
    assert.strictEqual(r.belongsToModel(Card, undefined), true);
  }

  @test
  ancestorTypedRowsBelongLikeUntypedRows() {
    const r = this.resolver;
    // A row typed as a strict ancestor of the table root belongs to the root and the root's ancestors
    assert.strictEqual(r.belongsToModel(AppUser, "webda/user", AppUser), true);
    assert.strictEqual(r.belongsToModel(AppUser, "Webda/User", AppUser), true);
    assert.strictEqual(r.belongsToModel(FwUser, "Webda/User", AppUser), true);
    assert.strictEqual(r.belongsToModel(FwIdent, "Webda/User", AppUser), false);
    assert.strictEqual(r.belongsToModel(Card, "MyApp/Transaction", Card), true);
    assert.strictEqual(r.belongsToModel(Transaction, "payment", Card), true);
    // Not to a subclass of the root, nor to an unrelated model
    assert.strictEqual(r.belongsToModel(Fee, "MyApp/Transaction", Card), false);
    assert.strictEqual(r.belongsToModel(Extra, "MyApp/Transaction", Card), false);
    // Without a known table root, the type alone decides
    assert.strictEqual(r.belongsToModel(AppUser, "Webda/User"), false);
  }

  @test
  hierarchyResolverIsExactOnly() {
    const r = ModelTypeResolver.forHierarchy(Transaction);
    assert.strictEqual(r.exactOnly, true);
    assert.strictEqual(r.resolveStoredType("MyApp/Fee"), Fee);
    assert.strictEqual(r.resolveStoredType("Transaction"), undefined);
    assert.strictEqual(r.resolveStoredType("MyApp/User"), undefined);
    assert.deepStrictEqual(r.acceptedTypes(Transaction), ["MyApp/Transaction", "MyApp/Card", "MyApp/Fee"]);
  }
}

@suite
class TypeResolverRegistryTest {
  afterEach() {
    setTypeResolver(undefined);
  }

  @test
  installedResolverServesItsModels() {
    setTypeResolver(undefined);
    assert.strictEqual(useTypeResolver(), undefined);
    const installed = new ModelTypeResolver(MODELS, { namespace: "MyApp" });
    setTypeResolver(installed);
    assert.strictEqual(useTypeResolver(), installed);
    assert.strictEqual(getTypeResolver(), installed);
    assert.strictEqual(getTypeResolver(Transaction), installed);
    assert.strictEqual(resolveStoredType("Payment"), Transaction);
    assert.ok(acceptedTypes(Card).includes("card"));
    assert.strictEqual(belongsToModel(Card, "fee"), true);
  }

  @test
  unknownModelsFallBackToTheirHierarchy() {
    class Loose extends UuidModel {}
    stamp(Loose, "Other/Loose");
    setTypeResolver(new ModelTypeResolver(MODELS, { namespace: "MyApp" }));
    const resolver = getTypeResolver(Loose);
    assert.notStrictEqual(resolver, useTypeResolver());
    assert.strictEqual(resolver.resolveStoredType("Other/Loose"), Loose);
    assert.deepStrictEqual(acceptedTypes(Loose), ["Other/Loose"]);
  }
}
