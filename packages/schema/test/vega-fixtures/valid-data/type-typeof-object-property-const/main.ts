const Foo = { bar: "foo" as const };

export type MyType = typeof Foo.bar;
