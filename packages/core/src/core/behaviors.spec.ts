import { suite, test, expect } from "vitest";
import { Behavior, BEHAVIOR_PARENT, isBehaviorClass, getBehaviorIdentifier } from "./behaviors.js";

suite("Behavior decorator", () => {
  test("marks a class so isBehaviorClass returns true", () => {
    @Behavior()
    class MFA {}
    expect(isBehaviorClass(MFA)).toBe(true);
  });

  test("isBehaviorClass returns false for a plain class", () => {
    class NotABehavior {}
    expect(isBehaviorClass(NotABehavior)).toBe(false);
  });

  test("installs setParent and exposes model/attribute getters", () => {
    @Behavior()
    class MFA {}
    const parent = { uuid: "u1" } as any;
    const instance = new MFA();
    (instance as any).setParent(parent, "mfa");
    expect((instance as any).model).toBe(parent);
    expect((instance as any).attribute).toBe("mfa");
  });

  test("model/attribute do not appear in JSON.stringify output", () => {
    @Behavior()
    class MFA {
      secret = "shh";
    }
    const instance = new MFA();
    (instance as any).setParent({ uuid: "u1" }, "mfa");
    const json = JSON.parse(JSON.stringify(instance));
    expect(json).toEqual({ secret: "shh" });
  });

  test("BEHAVIOR_PARENT slot is non-enumerable", () => {
    @Behavior()
    class MFA {}
    const instance = new MFA();
    (instance as any).setParent({ uuid: "u1" }, "mfa");
    const desc = Object.getOwnPropertyDescriptor(instance, BEHAVIOR_PARENT);
    expect(desc?.enumerable).toBe(false);
  });

  test("supports the @Behavior({ identifier }) factory form", () => {
    @Behavior({ identifier: "Auth/MFA" })
    class MFA {}
    expect(isBehaviorClass(MFA)).toBe(true);
    // Identifier override is read by the compiler at build time;
    // at runtime we expose it via getBehaviorIdentifier.
    expect(getBehaviorIdentifier(MFA)).toBe("Auth/MFA");
  });

  test("author-defined toJSON wins over the default", () => {
    @Behavior()
    class MFA {
      secret = "shh";
      toJSON() {
        return { redacted: true };
      }
    }
    const instance = new MFA();
    expect(JSON.parse(JSON.stringify(instance))).toEqual({ redacted: true });
  });

  test("author-defined setParent wins over the default", () => {
    let captured: any;
    @Behavior()
    class MFA {
      setParent(model: any, attribute: string) {
        captured = { model, attribute };
      }
    }
    const instance = new MFA();
    (instance as any).setParent({ uuid: "u1" }, "mfa");
    expect(captured).toEqual({ model: { uuid: "u1" }, attribute: "mfa" });
  });
});
