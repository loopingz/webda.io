import { suite, test } from "@webda/test";
import * as assert from "assert";
import { DirtyMixIn, DirtyState } from "./dirty";

/** Simple class used as the base for mixin tests */
class Base {
  name: string = "";
  age: number = 0;
  deep: { nested: string } = { nested: "" };
  deeper: { nested: { value: string } } = { nested: { value: "" } };
  array: any[] = [];
}

/** Base class wrapped with dirty-tracking via DirtyMixIn */
const TrackedBase = DirtyMixIn(Base);

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
 * Integration tests for {@link DirtyMixIn}, verifying that the Proxy
 * intercepts property assignments and delegates to the internal DirtyState.
 */
@suite
class DirtyMixInTest {
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
    const TrackedGreeter = DirtyMixIn(Greeter);
    const obj = new TrackedGreeter("hello");
    assert.strictEqual(obj.greeting, "hello");
  }

  @test
  deepChanges() {
    const obj = new TrackedBase();
    assert.strictEqual(obj.dirty, null);
    obj.deep.nested = "changed";
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["deep"]);
  }

  @test
  deeperChanges() {
    const obj = new TrackedBase();
    assert.strictEqual(obj.dirty, null);
    obj.deeper.nested.value = "changed";
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["deeper"]);
  }

  @test
  arrayChanges() {
    const obj = new TrackedBase();
    assert.strictEqual(obj.dirty, null);
    obj.array.push("item");
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["array"]);
    obj.dirty!.clear();
    assert.strictEqual(obj.dirty, null);
    obj.array[0] = "item";
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["array"]);
    obj.dirty!.clear();
    obj.array.push("item2");
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["array"]);
  }

  /** Test that all array mutation methods properly mark the object as dirty */
  @test
  arrayMutationMethods() {
    // Test push
    const obj1 = new TrackedBase();
    obj1.array.push("a", "b");
    assert.notStrictEqual(obj1.dirty, null);
    assert.deepStrictEqual(obj1.dirty!.getProperties(), ["array"]);

    // Test pop
    const obj2 = new TrackedBase();
    obj2.array = ["a", "b", "c"];
    obj2.dirty!.clear();
    obj2.array.pop();
    assert.notStrictEqual(obj2.dirty, null);

    // Test shift
    const obj3 = new TrackedBase();
    obj3.array = ["a", "b", "c"];
    obj3.dirty!.clear();
    obj3.array.shift();
    assert.notStrictEqual(obj3.dirty, null);

    // Test unshift
    const obj4 = new TrackedBase();
    obj4.array.unshift("a", "b");
    assert.notStrictEqual(obj4.dirty, null);

    // Test splice
    const obj5 = new TrackedBase();
    obj5.array = ["a", "b", "c"];
    obj5.dirty!.clear();
    obj5.array.splice(1, 1, "x");
    assert.notStrictEqual(obj5.dirty, null);

    // Test sort
    const obj6 = new TrackedBase();
    obj6.array = ["c", "a", "b"];
    obj6.dirty!.clear();
    obj6.array.sort();
    assert.notStrictEqual(obj6.dirty, null);

    // Test reverse
    const obj7 = new TrackedBase();
    obj7.array = ["a", "b", "c"];
    obj7.dirty!.clear();
    obj7.array.reverse();
    assert.notStrictEqual(obj7.dirty, null);
  }

  @test
  arrayObject() {
    const obj = new TrackedBase();
    obj.array.push({ name: "item1" });
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["array"]);
    obj.dirty!.clear();

    // Modifying the object inside the array should also mark dirty
    obj.array[0].name = "changed";
    assert.notStrictEqual(obj.dirty, null);
    assert.deepStrictEqual(obj.dirty!.getProperties(), ["array"]);
  }
}
