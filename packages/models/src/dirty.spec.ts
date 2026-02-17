import { suite, test } from "@webda/test";
import * as assert from "assert";
import { DirtyMixin, DirtyState } from "./dirty";

/** Simple class used as the base for mixin tests */
class Base {
  name: string = "";
  age: number = 0;
}

/** Base class wrapped with dirty-tracking via DirtyMixin */
const TrackedBase = DirtyMixin(Base);

/**
 * Unit tests for {@link DirtyState} in isolation (no Proxy involved).
 */
@suite
class DirtyStateTest {
  /** A freshly created DirtyState with no recorded changes should not be dirty */
  @test
  emptyStateIsNotDirty() {
    const state = new DirtyState();
    assert.strictEqual(state.valueOf(), false);
    assert.deepStrictEqual(state.getProperties(), []);
  }

  /** Adding a field with a different value marks the state as dirty */
  @test
  addingFieldMarksDirty() {
    const state = new DirtyState();
    state.add("name", "old", "new");
    assert.strictEqual(state.valueOf(), true);
    assert.deepStrictEqual(state.getProperties(), ["name"]);
  }

  /** Setting a field back to its original value should remove it from the dirty set */
  @test
  revertingToOriginalRemovesDirty() {
    const state = new DirtyState();
    state.add("name", "original", "changed");
    assert.strictEqual(state.valueOf(), true);

    // Setting back to the original value should clear the field
    state.add("name", "changed", "original");
    assert.strictEqual(state.valueOf(), false);
    assert.deepStrictEqual(state.getProperties(), []);
  }

  /** Changing several fields independently should track each one */
  @test
  multipleFields() {
    const state = new DirtyState();
    state.add("name", "a", "b");
    state.add("age", 1, 2);
    assert.strictEqual(state.valueOf(), true);
    assert.deepStrictEqual(state.getProperties().sort(), ["age", "name"]);
  }

  /** clear() should reset all dirty fields and original-value bookkeeping */
  @test
  clearResetsAll() {
    const state = new DirtyState();
    state.add("name", "a", "b");
    state.add("age", 1, 2);
    state.clear();
    assert.strictEqual(state.valueOf(), false);
    assert.deepStrictEqual(state.getProperties(), []);
  }

  /**
   * When a field changes multiple times (a → b → c), the original value "a"
   * is still remembered. Reverting to "a" should make the field clean again.
   */
  @test
  originalValueTrackedAcrossMultipleChanges() {
    const state = new DirtyState();
    // original value is "a", changed to "b"
    state.add("name", "a", "b");
    // changed again to "c" — original is still "a"
    state.add("name", "b", "c");
    assert.strictEqual(state.valueOf(), true);

    // revert to "a" — should become clean
    state.add("name", "c", "a");
    assert.strictEqual(state.valueOf(), false);
    assert.deepStrictEqual(state.getProperties(), []);
  }

  /** Constructing with a pre-populated field set should start dirty */
  @test
  initWithFields() {
    const state = new DirtyState(new Set(["name"]));
    assert.strictEqual(state.valueOf(), true);
    assert.deepStrictEqual(state.getProperties(), ["name"]);
  }
}

/**
 * Integration tests for {@link DirtyMixin}, verifying that the Proxy
 * intercepts property assignments and delegates to the internal DirtyState.
 */
@suite
class DirtyMixinTest {
  /** A newly constructed instance should have no dirty fields */
  @test
  freshInstanceIsClean() {
    const obj = new TrackedBase();
    assert.strictEqual(obj.dirty, null);
  }

  /** Assigning a property should mark it as dirty */
  @test
  settingPropertyMarksDirty() {
    const obj = new TrackedBase();
    obj.name = "Alice";
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["name"]);
  }

  /** The proxy get trap should return the correct values after assignment */
  @test
  readingPropertiesWorks() {
    const obj = new TrackedBase();
    obj.name = "Bob";
    obj.age = 30;
    assert.strictEqual(obj.name, "Bob");
    assert.strictEqual(obj.age, 30);
  }

  /** Assigning a property back to its original value should clear the dirty flag */
  @test
  revertingPropertyCleansState() {
    const obj = new TrackedBase();
    const original = obj.name;
    obj.name = "changed";
    assert.notStrictEqual(obj.dirty, null);

    obj.name = original;
    assert.strictEqual(obj.dirty, null);
  }

  /** Calling clear() on the DirtyState should reset the entire dirty tracker */
  @test
  clearResetsDirtyState() {
    const obj = new TrackedBase();
    obj.name = "changed";
    obj.age = 99;
    assert.notStrictEqual(obj.dirty, null);

    obj.dirty!.clear();
    assert.strictEqual(obj.dirty, null);
  }

  /** Changing multiple properties should track all of them independently */
  @test
  multiplePropertyChanges() {
    const obj = new TrackedBase();
    obj.name = "Alice";
    obj.age = 25;
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties().sort(), ["age", "name"]);
  }

  /** Reverting one property while another remains changed should keep dirty state */
  @test
  partialRevert() {
    const obj = new TrackedBase();
    const originalName = obj.name;
    obj.name = "Alice";
    obj.age = 25;

    // Revert only name — age should still be dirty
    obj.name = originalName;
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["age"]);
  }

  /** Constructor arguments of the base class should be forwarded correctly */
  @test
  constructorArgsPassedThrough() {
    class Greeter {
      greeting: string;
      constructor(greeting: string) {
        this.greeting = greeting;
      }
    }
    const TrackedGreeter = DirtyMixin(Greeter);
    const obj = new TrackedGreeter("hello");
    assert.strictEqual(obj.greeting, "hello");
  }
}
