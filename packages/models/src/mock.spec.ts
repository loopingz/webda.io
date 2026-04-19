import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock, readMockMeta } from "./mock.js";

@suite("@Mock decorator surface")
class MockDecoratorTest {
  @test({ name: "named decorator stores kind with no options" })
  namedKind() {
    class A {
      @Mock.email accessor email!: string;
    }
    expect(readMockMeta(A as any)).toEqual({ email: { kind: "email" } });
  }

  @test({ name: "parameterised decorator stores kind + options" })
  parameterised() {
    class A {
      @Mock.integer({ min: 0, max: 10 }) accessor n!: number;
      @Mock.lorem({ words: 5 }) accessor note!: string;
    }
    const meta = readMockMeta(A as any);
    expect(meta.n).toEqual({ kind: "integer", options: { min: 0, max: 10 } });
    expect(meta.note).toEqual({ kind: "lorem", options: { words: 5 } });
  }

  @test({ name: "count accepts number or range" })
  countForms() {
    class A {
      @Mock.count(5) accessor a!: unknown;
      @Mock.count({ min: 1, max: 3 }) accessor b!: unknown;
    }
    const meta = readMockMeta(A as any);
    expect(meta.a).toEqual({ kind: "count", options: { n: 5 } });
    expect(meta.b).toEqual({ kind: "count", options: { min: 1, max: 3 } });
  }

  @test({ name: "generic callable form accepts arbitrary kind for forward-compat" })
  genericCallable() {
    class A {
      @Mock({ kind: "customFutureKind", options: { foo: 1 } }) accessor x!: unknown;
    }
    expect(readMockMeta(A as any).x).toEqual({
      kind: "customFutureKind",
      options: { foo: 1 }
    });
  }

  @test({ name: "subclass decorator overrides parent's entry for the same field" })
  subclassOverride() {
    class Parent {
      @Mock.email accessor contact!: string;
    }
    class Child extends Parent {
      @Mock.phone accessor contact!: string;
    }
    expect(readMockMeta(Parent as any).contact).toEqual({ kind: "email" });
    expect(readMockMeta(Child as any).contact).toEqual({ kind: "phone" });
  }

  @test({ name: "pick stores its values array" })
  pickValues() {
    class A {
      @Mock.pick(["draft", "active", "archived"]) accessor status!: string;
    }
    expect(readMockMeta(A as any).status).toEqual({
      kind: "pick",
      options: { values: ["draft", "active", "archived"] }
    });
  }

  @test({ name: "class with no @Mock decorators yields empty meta" })
  emptyClass() {
    class A {}
    expect(readMockMeta(A as any)).toEqual({});
  }
}
