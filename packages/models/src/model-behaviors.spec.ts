import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Model, registerBehaviorClass } from "./model.js";
import { WEBDA_PRIMARY_KEY } from "./storable.js";

/**
 * Minimal Behavior-shape stub. We can't import `@Behavior()` from `@webda/core`
 * here because `@webda/core` already depends on `@webda/models` — adding the
 * reverse direction would create a circular workspace dependency.
 *
 * The runtime contract the registry / hydration layer cares about is just:
 * "the value at `instance[attribute]` is replaced by an instance of the
 * registered class, with `setParent(model, attribute)` invoked on it".
 * `setParent` itself is installed by `@Behavior()` in real usage; we stub a
 * matching shape here.
 */
class MFA {
  secret?: string;
  lastVerified?: number;

  setParent(model: any, attribute: string): void {
    Object.defineProperty(this, "__parent", {
      value: { model, attribute },
      enumerable: false,
      configurable: true,
      writable: true
    });
  }

  get model(): any {
    return (this as any).__parent?.model;
  }

  get attribute(): string | undefined {
    return (this as any).__parent?.attribute;
  }

  toJSON(): any {
    const out: any = {};
    for (const key of Object.keys(this)) {
      out[key] = (this as any)[key];
    }
    return out;
  }
}

class FakeUser extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  uuid: string;
  mfa: MFA;
}

// Pretend the compiler emitted Relations.behaviors for FakeUser.
(FakeUser as any).Metadata = {
  Identifier: "Test/FakeUser",
  Plural: "FakeUsers",
  Schemas: {},
  Relations: {
    behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
  },
  Ancestors: [],
  Subclasses: [],
  PrimaryKey: ["uuid"],
  Events: [],
  Reflection: {},
  Actions: {}
};

registerBehaviorClass("Test/MFA", MFA);

@suite("CoreModel Behavior hydration")
class CoreModelBehaviorHydrationTest {
  @test({ name: "deserialize coerces a plain object into a Behavior instance with parent set" })
  hydratePlainObject() {
    const user = new FakeUser();
    user.uuid = "u1";
    user.load({ uuid: "u1", mfa: { secret: "shh", lastVerified: 1700000000 } } as any);
    expect(user.mfa).toBeInstanceOf(MFA);
    expect(user.mfa.secret).toBe("shh");
    expect(user.mfa.lastVerified).toBe(1700000000);
    expect((user.mfa as any).model).toBe(user);
    expect((user.mfa as any).attribute).toBe("mfa");
  }

  @test({ name: "deserialize wires a fresh Behavior instance when the field is absent" })
  hydrateAbsentField() {
    const user = new FakeUser();
    user.uuid = "u1";
    user.load({ uuid: "u1" } as any);
    expect(user.mfa).toBeInstanceOf(MFA);
    expect(user.mfa.secret).toBeUndefined();
    expect((user.mfa as any).model).toBe(user);
    expect((user.mfa as any).attribute).toBe("mfa");
  }

  @test({ name: "a value already an instance of the Behavior is reused, parent is set" })
  reuseExistingInstance() {
    const user = new FakeUser();
    user.uuid = "u1";
    const supplied = new MFA();
    supplied.secret = "preset";
    user.load({ uuid: "u1", mfa: supplied } as any);
    expect(user.mfa).toBe(supplied);
    expect(user.mfa.secret).toBe("preset");
    expect((user.mfa as any).model).toBe(user);
    expect((user.mfa as any).attribute).toBe("mfa");
  }

  @test({ name: "toJSON strips parent / attribute / framework refs" })
  toJsonOmitsFrameworkSlots() {
    const user = new FakeUser();
    user.uuid = "u1";
    user.load({ uuid: "u1", mfa: { secret: "shh" } } as any);
    const json = JSON.parse(JSON.stringify(user.mfa));
    expect(json).toEqual({ secret: "shh" });
  }
}
