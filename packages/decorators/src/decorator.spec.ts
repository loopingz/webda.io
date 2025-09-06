import { describe, it } from "vitest";
import { createClassDecorator, createMethodDecorator, createPropertyDecorator } from "./decorator.js";
import * as assert from "assert";

const calls: any[] = [];

const MyClassDecorator = createClassDecorator(
  (value: any, context: ClassDecoratorContext, options?: { name: string }) => {
    // Do nothing
    calls.push({ value, context, options });
  }
);
const MyMethodDecorator = createMethodDecorator(
  (value: any, context: ClassMethodDecoratorContext, options?: { name: string }) => {
    // Do nothing
    calls.push({ value, context, options });
  }
);
const MyPropertyDecorator = createPropertyDecorator(
  (value: any, context: ClassFieldDecoratorContext, options?: { name: string }) => {
    // Do nothing
    calls.push({ value, context, options });
  }
);

@MyClassDecorator
class Test {
  @MyPropertyDecorator
  attr: string;
  @MyMethodDecorator
  method() {}
}

@MyClassDecorator({
  name: "plop"
})
class Test2 {
  @MyPropertyDecorator({ name: "plop" })
  attr: string;
  @MyMethodDecorator({ name: "plop" })
  method() {}
}

describe("decorator", () => {
  it("should be defined", () => {
    //
    console.log(calls);
    assert.deepStrictEqual(calls.length, 6);
    const classes = calls.filter(c => c.context.kind === "class");
    const fields = calls.filter(c => c.context.kind === "field");
    const methods = calls.filter(c => c.context.kind === "method");
    assert.strictEqual(classes.length, 2);
    assert.strictEqual(fields.length, 2);
    assert.strictEqual(methods.length, 2);
    assert.strictEqual(calls.filter(c => c.options?.name === "plop").length, 3);
    assert.strictEqual(calls.filter(c => c.options?.name === "plop" && c.context.kind === "class").length, 1);
    assert.strictEqual(calls.filter(c => c.options?.name === "plop" && c.context.kind === "field").length, 1);
    assert.strictEqual(calls.filter(c => c.options?.name === "plop" && c.context.kind === "method").length, 1);
    assert.strictEqual(calls.filter(c => !c.options).length, 3);
  });
});
