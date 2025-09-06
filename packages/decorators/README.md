# @webda/decorators

This is a small library to help create decorators that can be called with or without parenthesis

```
const MyClassDecorator = createClassDecorator(
  (value: any, context: ClassDecoratorContext, options?: { name: string }) => {
    // Do something
  }
);
const MyMethodDecorator = createMethodDecorator(
  (value: any, context: ClassMethodDecoratorContext, options?: { name: string }) => {
    // Do something
  }
);
const MyPropertyDecorator = createPropertyDecorator(
  (value: any, context: ClassFieldDecoratorContext, options?: { name: string }) => {
    // Do something
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
```
