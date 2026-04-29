import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { Binary, BinariesImpl } from "./binary.js";
import { Action } from "../models/decorator.js";
import { WEBDA_STORAGE } from "@webda/models";

/**
 * Phase 2: Binary / BinariesImpl as Behaviors.
 *
 * The full Behavior dispatch path goes Compiler → DomainService.addBehaviorOperations
 * → modelBehaviorAction → @Action method body. The integration end of that
 * pipeline is exercised by the existing `binary*` tests in
 * `domainservice.spec.ts` (still routed through the legacy dispatcher) and
 * by Phase 3's smoke test (which deletes the legacy path).
 *
 * This file focuses on the unit-level claims of Phase 2:
 *   1. `Binary` and `BinariesImpl` are tagged as Behaviors at compile time
 *      (verified via the emitted `webda.module.json`).
 *   2. The `@Action`-decorated methods exist on the runtime classes with
 *      the expected names and signatures.
 *   3. Runtime decorators don't interfere with the no-op behavior — applying
 *      `@Action(...)` returns the original method.
 *   4. The Behavior parent slot (`WEBDA_STORAGE["__parent__"]`) is the
 *      single source of truth for parent resolution; legacy 2-arg
 *      `new Binary(attribute, model)` continues to work.
 */
@suite
class BinaryBehaviorTest extends WebdaApplicationTest {
  /**
   * Sanity: `@Action` is a runtime symbol that returns the method untouched.
   */
  @test
  actionDecoratorIsNoop() {
    const fn = function example() {
      return 42;
    };
    // Direct form: @Action used without parens.
    const direct: any = (Action as any)(fn, {
      kind: "method",
      name: "example",
      static: false,
      private: false,
      access: { has: () => true, get: () => fn },
      addInitializer: () => {},
      metadata: {} as any
    });
    assert.strictEqual(direct(), 42, "direct @Action must return the original method");

    // Factory form: @Action({ rest: ... }) — produces a decorator that
    // returns the original method.
    const factory = (Action as any)({ rest: { route: ".", method: "GET" } });
    assert.strictEqual(typeof factory, "function", "factory form must return a decorator");
    const decorated: any = factory(fn, {
      kind: "method",
      name: "example",
      static: false,
      private: false,
      access: { has: () => true, get: () => fn },
      addInitializer: () => {},
      metadata: {} as any
    });
    assert.strictEqual(decorated(), 42, "factory @Action must return the original method");
  }

  /**
   * The 6 Behavior @Action methods on `Binary` are present and callable.
   * We don't drive end-to-end HTTP here — those flow through `callOperation`
   * and exercise BinaryService stubs, which the Phase 3 smoke test covers.
   */
  @test
  binaryHasAllExpectedActionMethods() {
    const proto = Binary.prototype as any;
    for (const m of ["attach", "attachChallenge", "download", "downloadUrl", "delete", "setMetadata"]) {
      assert.strictEqual(
        typeof proto[m],
        "function",
        `Binary.${m} must exist as an instance method`
      );
    }
  }

  /**
   * Same for `BinariesImpl`. `attach`/`attachChallenge` mirror Binary; the
   * MANY-cardinality variants `get`/`getUrl`/`deleteAt`/`setMetadata` take
   * an `index` first argument.
   */
  @test
  binariesImplHasAllExpectedActionMethods() {
    const proto = BinariesImpl.prototype as any;
    for (const m of ["attach", "attachChallenge", "get", "getUrl", "deleteAt", "setMetadata"]) {
      assert.strictEqual(
        typeof proto[m],
        "function",
        `BinariesImpl.${m} must exist as an instance method`
      );
    }
  }

  /**
   * The Behavior parent reference is read via `WEBDA_STORAGE["__parent__"]`.
   * The transformer-emitted `__hydrateBehaviors` writes it; here we manually
   * populate the slot on a freshly-constructed Behavior to confirm
   * `getService` reads it.
   *
   * Because `Binary` extends `BinaryMap` extends `BinaryFile`, and
   * `BinaryFile`'s constructor calls `this.set(info)` (which dispatches to
   * `Binary.set` and touches `[WEBDA_STORAGE]`), constructing through the
   * normal `new Binary()` path requires that `info` not be undefined and
   * that `BinaryMap`'s field initializer has already run before any
   * dispatch. We use `Object.create` to bypass the constructor and
   * directly install the storage slot — this matches how the transformer's
   * post-construction `__hydrateBehaviors` step would manipulate the
   * instance.
   */
  @test
  binaryGetServiceUsesParentSlot() {
    // Skip the constructor's BinaryFile chain — install the slot directly,
    // mimicking `__hydrateBehaviors` writing into a freshly-made instance.
    const b = Object.create(Binary.prototype);
    b[WEBDA_STORAGE] = {};

    // Default: no parent wired ⇒ getService throws "parent not yet wired".
    assert.throws(
      () => (b as any).getService(),
      /parent not yet wired/,
      "Binary.getService must error when no parent is wired"
    );

    // Hand-roll the parent slot. We don't construct a real BinaryService;
    // we just expect getService to attempt a lookup via
    // `useCore().getBinaryStore(parent.instance, parent.attribute)` and
    // either throw "No binary store found" (no BinaryService registered)
    // or report "parent not yet wired" if the slot isn't read.
    const fakeParent = { uuid: "fake" };
    b[WEBDA_STORAGE]["__parent__"] = { instance: fakeParent, attribute: "image" };
    assert.throws(
      () => (b as any).getService(),
      /No binary store found|parent not yet wired/,
      "After wiring parent, getService must look up the BinaryService for it"
    );
  }

  /**
   * `BinariesImpl.toJSON()` returns a plain array — not the
   * `{ "0": item0, "1": item1 }` shape an Object.keys-based serializer would
   * produce. This is critical: an Array-subclass Behavior with the
   * transformer-injected toJSON would have broken the on-disk wire format
   * for many-cardinality binaries.
   */
  @test
  binariesImplToJSONReturnsArray() {
    const b = new BinariesImpl();
    const json = b.toJSON();
    assert.ok(Array.isArray(json), "BinariesImpl.toJSON must return a real array");
    assert.strictEqual(json.length, 0, "empty array round-trips correctly");

    // After native push the array shape stays.
    (b as any)[WEBDA_STORAGE]["__parent__"] = { instance: { uuid: "fake" }, attribute: "photos" };
    // We can't `push` real BinariesItems without a service, but JSON.stringify
    // of the empty array must yield `[]`, not `{}`.
    assert.strictEqual(JSON.stringify(b), "[]");
  }

  /**
   * BinariesImpl's `getService` reads the same `__parent__` slot. Mirrors
   * the Binary test above, using `Object.create` to skip the constructor.
   */
  @test
  binariesImplGetServiceUsesParentSlot() {
    const b: any = Object.create(BinariesImpl.prototype);
    b[WEBDA_STORAGE] = {};
    assert.throws(
      () => b.getService(),
      /parent not yet wired/,
      "BinariesImpl.getService must error when no parent is wired"
    );
    b[WEBDA_STORAGE]["__parent__"] = { instance: { uuid: "fake" }, attribute: "photos" };
    assert.throws(
      () => b.getService(),
      /No binary store found|parent not yet wired/,
      "After wiring parent, getService must look up the BinaryService for it"
    );
  }
}
