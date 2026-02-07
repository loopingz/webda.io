import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  registerSerializer,
  serialize,
  SerializerContext,
  unregisterSerializer,
  deserialize,
  ObjectSerializer,
  serializeRaw,
  deserializeRaw,
  Constructor
} from "./serializer";
import DateSerializer from "./builtin/date";

class Test {
  startDate!: Date;
  endDate!: Date;
  quantity!: bigint;

  constructor(json?: any) {
    this.unserialize(json);
  }

  unserialize(json?: any): this {
    if (json?.startDate || !this.startDate) {
      this.startDate = new Date(json?.startDate || Date.now());
    }
    if (json?.endDate || !this.endDate) {
      this.endDate = new Date(json?.endDate || Date.now());
    }
    if (json?.quantity || !this.quantity) {
      this.quantity = BigInt(json?.quantity || "0");
    }
    return this;
  }

  static unserialize(json: any): Test {
    return new Test(json);
  }

  toJSON() {
    return {
      startDate: this.startDate.toISOString(),
      endDate: this.endDate.toISOString(),
      quantity: this.quantity.toString()
    };
  }
}

class Test2 {
  name: string;
  static deserialize<T extends (...args: any[]) => any>(this: Constructor<T>, json: any) {
    console.log("Deserialize Test2", this, json);
    const instance = new this();
    Object.assign(instance, json);
    return instance;
  }
}

class Test3 extends Test2 {
  count: number;
}

class TestInvalid {
  static deserialize() {
    throw new Error("Invalid deserialize");
  }
}

@suite
class Serializer {
  @test
  async testBasicTypes() {
    const arrayBuffer = new ArrayBuffer(8);
    const uint = new Uint8Array(arrayBuffer);
    for (let i = 0; i < uint.byteLength; i++) {
      uint[i] = i + 1;
    }

    const source = {
      date: new Date("2023-10-01"),
      map: new Map<string, any>([
        ["key", "value"],
        ["key2", 12],
        ["key3", true],
        ["key4", new Date("2024-10-01")]
      ]),
      null: null,
      infinity: Infinity,
      nan: NaN,
      undefined: undefined,
      set: new Set<any>([1, 2, 3, "plop", { a: 1 }, new Date("2023-10-01")]),
      array: [1, 2, 3, "plop", { a: 1 }, new Date("2023-10-01")],
      arrayBuffer,
      subobject: {
        buffer: Buffer.from("Hello, world!"),
        bigint: BigInt(12345678901234567890),
        regex: /hello/i,
        regex2: new RegExp("te?t"),
        regex3: /test\/test/gi,
        url: new URL("https://example.com")
      }
    };
    const serialized = serialize(source);
    const deserialized = deserialize(serialized);
    console.log("Serialized:", serialized);
    console.log("Deserialized:", deserialized);
    assert.deepStrictEqual(source, deserialized);
    assert.throws(
      () => new SerializerContext().getSerializer("undefined2"),
      /Serializer for type 'undefined2' not found/
    );
  }

  @test
  testBasic() {
    const source = {
      number: 12,
      string: "test",
      boolean: true,
      obj: {
        name: "test",
        email: ""
      }
    };
    const serialized = serialize(source);
    const deserialized = deserialize(serialized);
    assert.deepStrictEqual(source, deserialized);
    assert.ok(!serialized.includes("$serializer"));
  }

  @test
  testCustomSerializer() {
    try {
      registerSerializer("test", {
        constructorType: Test,
        deserializer: Test.unserialize
      });
      const test = new Test();
      const serialized = serialize(test);
      const { $serializer } = JSON.parse(serialized);
      // Check that the serialized object has the correct type
      assert.deepStrictEqual(
        $serializer,
        {
          type: "test"
        },
        "Serialized object should have a simple type"
      );
      const deserialized = deserialize(serialized);
      assert.deepStrictEqual(test, deserialized);

      // Do a serialization within a subobject
      const source = {
        eventType: "test",
        test: test,
        emittedAt: new Date()
      };
      const clone = deserialize(serialize(source));
      assert.deepStrictEqual(clone, source);
      assert.ok(clone.test instanceof Test);
      assert.ok(clone.test.startDate instanceof Date);
      assert.ok(clone.test.endDate instanceof Date);
      assert.ok(typeof clone.test.quantity === "bigint");
      assert.ok(clone.emittedAt instanceof Date);
    } finally {
      unregisterSerializer("test");
    }
  }

  @test
  testCircular() {
    const source: any = {
      name: "test",
      circular: null
    };
    source.circular = source;
    const serialized = serialize(source);
    const deserialized = deserialize(serialized);
    assert.deepStrictEqual(source, deserialized);
  }

  @test
  testCircular2() {
    const obj: any = {
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4
      }
    };
    obj.c.f = obj;
    obj.c.g = obj.c;
    const serialized = serialize(obj);
    const deserialized = deserialize(serialized);
    assert.deepStrictEqual(obj, deserialized);
  }

  @test
  testReference() {
    const email = {
      name: "test",
      email: "test@test.com"
    };
    const source: any = {
      name: "test",
      subobject: {
        name: "test",
        email
      },
      email,
      array: [1, 2, email],
      set: new Set([1, 2, email]),
      map: new Map<string, any>([
        ["key", email],
        ["key2", 12]
      ])
    };
    const serialized = serialize(source);
    assert.ok(serialized.includes("$ref"));
    const deserialized = deserialize(serialized);
    assert.deepStrictEqual(source, deserialized);
  }

  @test
  testCustomContext() {
    const serializer = new SerializerContext().unregisterSerializer("undefined");
    assert.ok(
      !serializer
        .serialize({
          test: undefined,
          plop: true
        })
        .includes("test")
    );
  }

  @test
  testUndefined() {
    assert.strictEqual(deserialize(serialize(undefined)), undefined);
    assert.strictEqual(deserialize(undefined as any), undefined);
  }

  @test
  testObjectStaticProperties() {
    registerSerializer(
      "Test",
      new ObjectSerializer(Test, {
        startDate: { type: "Date" },
        endDate: { type: "Date" },
        quantity: { type: "bigint" }
      })
    );
    const obj = new Test();
    const serialized = serialize(obj);
    const deserialized = deserialize(serialized);
    assert.ok(deserialized instanceof Test);
    assert.ok(deserialized.startDate instanceof Date);
    assert.ok(deserialized.endDate instanceof Date);
    assert.ok(typeof deserialized.quantity === "bigint");
  }

  @test
  testRaw() {
    const raw = {
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4
      }
    };
    const serialized = serialize(raw);
    const serializedRaw = serializeRaw(raw);
    const deserialized = deserialize(serialized);
    const deserializedRaw = deserializeRaw(serializedRaw);
    assert.deepStrictEqual(raw, deserialized);
    assert.deepStrictEqual(raw, deserializedRaw);
  }

  @test
  testBuffer() {
    const buffer = Buffer.from("Hello World");
    const serialized = serialize(buffer);
    assert.deepStrictEqual(deserialize(serialized) as Buffer, buffer);
  }

  @test
  testArray() {
    const array = [1, 2, 3];
    const serialized = serialize(array);
    console.log("Serialized array:", serialized);
    assert.deepStrictEqual(deserialize(serialized) as number[], array);
  }

  @test
  testBigint() {
    const bigint = BigInt(12345678901234567890);
    const serialized = serialize(bigint);
    const deserialized = deserialize(serialized);
    assert.strictEqual(typeof deserialized, "bigint");
    assert.strictEqual(deserialized, bigint);
  }

  @test
  testErrors() {
    const serializer = new SerializerContext();
    assert.throws(() => serializer.registerSerializer("bigint", {} as any), /already registered/);
    serializer.mode = "serialize";
    assert.throws(() => serializer.getReference("#/test", {}), /Cannot get reference in serialize mode/);
    serializer.mode = "deserialize";
    assert.throws(() => serializer.getReference("#/test", { test2: {} }), /Reference '#\/test' not found/);
    assert.throws(() => serializer.getReference("test", {}), /Invalid reference 'test'/);
    assert.throws(
      () => serializer.deserialize(`{"$serializer":{"type":"test2"}}`),
      /Serializer for type 'test2' not found/
    );
  }

  @test
  testRegisterError() {
    const test = new Test2();
    test.name = "test";
    assert.throws(
      () => serialize(test),
      /Serializer for object with constructor 'Test2' not found but a deserializer exists, please use registerSerializer\(Test2\) prior to serialization/
    );
  }

  @test
  async testSymbolAndFunction() {
    // Test symbol serialization (should return undefined)
    const symbolValue = Symbol("test");
    const result = serialize(symbolValue);
    assert.strictEqual(deserialize(result), undefined);

    // Test function serialization (should return undefined)
    const functionValue = () => "test";
    const result2 = serialize(functionValue);
    assert.strictEqual(deserialize(result2), undefined);
  }

  @test
  async testInvalidRegexDeserialization() {
    // Test invalid regex string that doesn't match the pattern
    const context = new SerializerContext();
    const regexSerializer = context.getSerializer("RegExp");

    assert.throws(
      () => regexSerializer.deserializer("invalid-regex", {}, context),
      /Invalid regex string: invalid-regex/
    );
  }

  @test
  async testMissingSerializer() {
    // Test error when no serializer is found for a type
    const context = new SerializerContext();

    // Create a scenario by temporarily removing the object serializer
    const obj = { test: "value" };
    context.unregisterSerializer("object");

    try {
      assert.throws(() => {
        context.serialize(obj);
      }, /Serializer for type 'object' not found/);
    } finally {
      // Restore object serializer
      context.registerSerializer("object", new ObjectSerializer());
    }
  }

  @test
  async testSerializerEdgeCases() {
    // Test various edge cases to improve coverage

    // Test with -Infinity
    const negInfinity = serialize(-Infinity);
    assert.strictEqual(deserialize(negInfinity), -Infinity);

    // Test special numeric values that can be properly serialized
    const specialNums = {
      positiveZero: +0,
      maxSafeInteger: Number.MAX_SAFE_INTEGER,
      minSafeInteger: Number.MIN_SAFE_INTEGER
    };
    const serializedNums = serialize(specialNums);
    const deserializedNums = deserialize(serializedNums);
    assert.deepStrictEqual(deserializedNums, specialNums);

    // Test negative zero specifically (should become positive zero in JSON)
    const negZero = serialize(-0);
    assert.strictEqual(deserialize(negZero), 0); // -0 becomes 0 in JSON
  }

  @test
  async testGetSerializerCoverage() {
    // Test getting serializer by constructor function to cover line 204
    const context = new SerializerContext();

    // Test getting serializer by constructor
    const dateSerializer = context.getSerializer(Date);
    assert.ok(dateSerializer);
    assert.strictEqual(dateSerializer.constructorType, Date);

    // Test getting serializer by string for a constructor-based serializer
    const dateSerializerByString = context.getSerializer("Date");
    assert.ok(dateSerializerByString);

    // Test error when getting non-existent serializer by constructor function
    class NonExistentClass {}
    assert.throws(() => {
      context.getSerializer(NonExistentClass);
    }, /Serializer for type 'NonExistentClass' not found/);

    // Test getting ref serializer to cover edge cases
    const refSerializer = context.getSerializer("ref");
    assert.ok(refSerializer);
    // The ref serializer is a special case that doesn't follow the normal Serializer interface
  }

  @test
  async testCircularReferenceInArray() {
    // Test fix for array circular reference bug (High Priority Issue #1)
    const obj: any = { name: "root" };
    const arr = [1, 2, obj, 4];
    obj.arr = arr;

    const serialized = serialize(obj);
    const deserialized: any = deserialize(serialized);

    // Verify structure
    assert.strictEqual(deserialized.name, "root");
    assert.ok(Array.isArray(deserialized.arr));
    assert.strictEqual(deserialized.arr.length, 4);
    assert.strictEqual(deserialized.arr[0], 1);
    assert.strictEqual(deserialized.arr[1], 2);
    assert.strictEqual(deserialized.arr[2], deserialized); // Circular ref
    assert.strictEqual(deserialized.arr[3], 4);

    // Test with multiple circular references in array
    const parent: any = { type: "parent" };
    const child: any = { type: "child", parent };
    const items = [parent, child, parent]; // parent appears twice
    parent.items = items;

    const serialized2 = serialize(parent);
    const deserialized2: any = deserialize(serialized2);

    assert.strictEqual(deserialized2.type, "parent");
    assert.strictEqual(deserialized2.items[0], deserialized2); // First reference
    assert.strictEqual(deserialized2.items[1].parent, deserialized2); // Nested reference
    assert.strictEqual(deserialized2.items[2], deserialized2); // Second reference
  }

  @test
  async testGetSerializerTypeSafety() {
    // Test fix for getSerializer type safety (High Priority Issue #2)
    const context = new SerializerContext();

    // Test that ref serializer has proper structure
    const refSerializer = context.getSerializer("ref");
    assert.ok(refSerializer.constructorType === null);
    assert.ok(typeof refSerializer.serializer === "function");
    assert.ok(typeof refSerializer.deserializer === "function");
    assert.strictEqual(refSerializer.type, "ref");

    // Verify it creates proper $ref structure
    const result = refSerializer.serializer("test/path", context);
    assert.deepStrictEqual(result, { value: { $ref: "test/path" } });

    // Test improved error message
    assert.throws(
      () => context.getSerializer("NonExistentType"),
      /Serializer for type 'NonExistentType' not found. Did you forget to call registerSerializer/
    );
  }

  @test
  async testJsonPointerDecoding() {
    // Test fix for JSON-Pointer decoding (High Priority Issue #3)
    const context = new SerializerContext();
    context.mode = "deserialize";

    // Test basic path
    const obj1 = { user: { posts: ["Hello", "World"] } };
    assert.strictEqual(context.getReference("#/user/posts/0", obj1), "Hello");
    assert.strictEqual(context.getReference("#/user/posts/1", obj1), "World");

    // Test escaped characters in property names (RFC 6901)
    const obj2 = {
      "a/b": { "c~d": "value" }
    };
    // ~1 encodes /, ~0 encodes ~
    assert.strictEqual(context.getReference("#/a~1b/c~0d", obj2), "value");

    // Test error when path doesn't exist
    assert.throws(
      () => context.getReference("#/nonexistent", obj1),
      /Reference '#\/nonexistent' not found: property 'nonexistent' does not exist/
    );

    // Test error when traversing null
    const obj3 = { a: null };
    assert.throws(
      () => context.getReference("#/a/b", obj3),
      /Reference '#\/a\/b' failed: cannot traverse null\/undefined at segment 'b'/
    );

    // Test error when property value is undefined (caught by cur === undefined check)
    const obj4 = { a: { b: undefined } };
    assert.throws(
      () => context.getReference("#/a/b", obj4),
      /Reference '#\/a\/b' not found: property 'b' does not exist/
    );

    // Test error when trying to traverse deeper after hitting null/undefined
    // Create object where we can actually traverse to a property that has null
    const obj4b: any = { a: { b: null } };
    assert.throws(
      () => context.getReference("#/a/b/c", obj4b),
      /Reference '#\/a\/b\/c' failed: cannot traverse null\/undefined at segment 'c'/
    );

    // Test invalid reference format
    assert.throws(
      () => context.getReference("invalid", obj1),
      /Invalid reference 'invalid': must start with '#\/'/
    );

    // Test empty segments are filtered out
    const obj5 = { a: { b: "value" } };
    assert.strictEqual(context.getReference("#/a//b", obj5), "value");

    // Test complex real-world scenario
    const obj6 = {
      "user/name": "Alice",
      "data~info": { "level~1": { count: 42 } }
    };
    assert.strictEqual(context.getReference("#/user~1name", obj6), "Alice");
    assert.strictEqual(context.getReference("#/data~0info/level~01/count", obj6), 42);
  }

  @test
  async testCircularReferencesWithJsonPointer() {
    // Integration test: circular references with proper JSON-Pointer handling
    const root: any = {
      "path/with/slashes": {
        "name~with~tildes": "test"
      }
    };
    root["path/with/slashes"].parent = root;

    const serialized = serialize(root);
    const deserialized: any = deserialize(serialized);

    assert.strictEqual(deserialized["path/with/slashes"]["name~with~tildes"], "test");
    assert.strictEqual(deserialized["path/with/slashes"].parent, deserialized);
  }

  @test
  async testArrayWithComplexCircularReferences() {
    // More comprehensive array circular reference tests
    const grandparent: any = { level: "grandparent" };
    const parent: any = { level: "parent", grandparent };
    const child: any = { level: "child", parent };

    // Create complex circular structure with arrays
    grandparent.children = [parent];
    parent.children = [child];
    child.siblings = [child, parent, grandparent]; // Multiple circular refs

    const serialized = serialize(grandparent);
    const deserialized: any = deserialize(serialized);

    // Verify structure
    assert.strictEqual(deserialized.level, "grandparent");
    assert.strictEqual(deserialized.children[0].level, "parent");
    assert.strictEqual(deserialized.children[0].grandparent, deserialized);
    assert.strictEqual(deserialized.children[0].children[0].level, "child");
    assert.strictEqual(deserialized.children[0].children[0].parent, deserialized.children[0]);

    // Verify circular refs in siblings array
    const childNode = deserialized.children[0].children[0];
    assert.strictEqual(childNode.siblings[0], childNode); // Self-reference
    assert.strictEqual(childNode.siblings[1], deserialized.children[0]); // Parent ref
    assert.strictEqual(childNode.siblings[2], deserialized); // Grandparent ref
  }

  @test
  async testDeserializeRawDoesNotMutateInput() {
    // Test fix for input mutation (Low Priority Issue #1)
    const raw = {
      value: { name: "test", count: 42 },
      $serializer: { type: "object" }
    };

    // Keep a reference to verify no mutation
    const originalSerializer = raw.$serializer;

    const deserialized = deserializeRaw(raw);

    // Verify the input object still has its $serializer property
    assert.ok(raw.$serializer, "Input object should still have $serializer");
    assert.strictEqual(raw.$serializer, originalSerializer, "$serializer should be unchanged");
    assert.deepStrictEqual(deserialized, { name: "test", count: 42 });
  }

  @test
  async testImprovedErrorMessages() {
    // Test improved error messages (Low Priority Issues #3 & #4)
    const context = new SerializerContext();

    // Test improved duplicate registration error
    assert.throws(
      () => context.registerSerializer("Date", DateSerializer),
      /Serializer for type 'Date' is already registered. Use overwrite=true to replace it, or call unregisterSerializer\('Date'\) first/
    );

    // Test improved not found error (already tested in testGetSerializerTypeSafety but verify again)
    assert.throws(
      () => context.getSerializer("UnknownType"),
      /Serializer for type 'UnknownType' not found. Did you forget to call registerSerializer/
    );
  }

  @test
  async testSpecificErrorCatching() {
    // Test that only expected errors are caught (Low Priority Issue #2)
    const context = new SerializerContext();

    // Serializing a string should not throw even though WeakMap.set will fail
    const result = context.serializeRaw("test string");
    assert.strictEqual(result, "test string");

    // Serializing a number should not throw
    const result2 = context.serializeRaw(123);
    assert.strictEqual(result2, 123);

    // Serializing a boolean should not throw
    const result3 = context.serializeRaw(true);
    assert.strictEqual(result3, true);

    // All these work because TypeError from WeakMap is caught and ignored
  }

  @test
  async testSerializerRegistrationEdgeCases() {
    // Test coverage for lines 353-364 in serializer.ts
    const context = new SerializerContext();

    // Test registering a serializer without a serializer function (defaults to toJSON)
    class CustomWithToJSON {
      value: number;
      constructor(val: number) {
        this.value = val;
      }
      toJSON() {
        return { customValue: this.value * 2 };
      }
    }

    context.registerSerializer("CustomWithToJSON", {
      constructorType: CustomWithToJSON,
      deserializer: (obj: any) => {
        const instance = new CustomWithToJSON(0);
        instance.value = obj.customValue / 2;
        return instance;
      }
    });

    const obj = new CustomWithToJSON(5);
    const serialized = context.serializeRaw(obj);
    assert.deepStrictEqual(serialized, {
      $serializer: { type: "CustomWithToJSON" },
      value: { customValue: 10 }
    });

    // Test registering a serializer with a static deserialize method
    class CustomWithDeserialize {
      value: number;
      constructor(val: number) {
        this.value = val;
      }
      static deserialize(obj: any, _metadata: any, _context: SerializerContext) {
        return new CustomWithDeserialize(obj.val);
      }
    }

    context.registerSerializer("CustomWithDeserialize", {
      constructorType: CustomWithDeserialize,
      serializer: (obj: CustomWithDeserialize) => ({ value: { val: obj.value } })
    });

    const obj2 = new CustomWithDeserialize(42);
    const serialized2 = context.serializeRaw(obj2);
    const deserialized2 = context.deserializeRaw(serialized2);
    assert.ok(deserialized2 instanceof CustomWithDeserialize);
    assert.strictEqual(deserialized2.value, 42);

    // Test that registering without deserializer and without static deserialize throws
    assert.throws(
      () =>
        context.registerSerializer("BadSerializer", {
          constructorType: class BadClass {},
          serializer: (obj: any) => ({ value: obj })
        }),
      /Deserializer is required for type 'BadSerializer'/
    );
  }

  @test
  async testMapWithoutMetadata() {
    // Test coverage for line 33 in map.ts (when metadata is empty)
    const context = new SerializerContext();
    const simpleMap = new Map<string, string | number>([
      ["key1", "value1"],
      ["key2", 123]
    ]);

    const serialized = context.serializeRaw(simpleMap);
    // When all values are primitives, metadata should be undefined
    assert.strictEqual(serialized.$serializer.metadata, undefined);
    assert.deepStrictEqual(serialized.value, {
      key1: "value1",
      key2: 123
    });
  }

  @test
  async testSetWithoutMetadata() {
    // Test coverage for line 31 in set.ts (when metadata is empty)
    const context = new SerializerContext();
    const simpleSet = new Set([1, 2, 3, "test"]);

    const serialized = context.serializeRaw(simpleSet);
    // When all values are primitives, metadata should be undefined
    assert.strictEqual(serialized.$serializer.metadata, undefined);
    assert.deepStrictEqual(serialized.value, [1, 2, 3, "test"]);
  }

  @test
  async testSetMetadataEdgeCases() {
    // Test coverage for line 43 in set.ts (metadata fallback with ||)
    const context = new SerializerContext();
    const setWithDate = new Set([new Date("2023-01-01")]);

    const serialized = context.serializeRaw(setWithDate);
    const deserialized = context.deserializeRaw(serialized);

    assert.ok(deserialized instanceof Set);
    const values = Array.from(deserialized);
    assert.ok(values[0] instanceof Date);
    assert.strictEqual(values[0].toISOString(), "2023-01-01T00:00:00.000Z");
  }

  @test
  async testObjectStaticPropertiesWithFunction() {
    // Test coverage for line 110 in object.ts (function-based static property)
    const context = new SerializerContext();

    class CustomObject {
      name: string;
      uppercaseName: string;

      constructor() {
        this.name = "";
        this.uppercaseName = "";
      }
    }

    const objectSerializer = new ObjectSerializer(CustomObject, {
      uppercaseName: (value: string) => value.toUpperCase()
    });

    context.registerSerializer("CustomObject", objectSerializer);

    const obj = Object.assign(new CustomObject(), {
      name: "test",
      uppercaseName: "test"
    });

    const serialized = context.serializeRaw(obj);
    const deserialized = context.deserializeRaw(serialized);

    assert.ok(deserialized instanceof CustomObject);
    assert.strictEqual(deserialized.name, "test");
    assert.strictEqual(deserialized.uppercaseName, "TEST");
  }

  @test
  async testRegisterSerializerWithStringTypeName() {
    // Test coverage for lines 341, 343-344 in serializer.ts
    const context = new SerializerContext();

    class MyCustomClass {
      value: string;
      constructor(val: string) {
        this.value = val;
      }
      static deserialize(obj: any, _metadata: any, _context: SerializerContext) {
        const instance = new MyCustomClass("");
        instance.value = obj.value;
        return instance;
      }
    }

    // Register with string type name and constructor as second parameter (line 343-344)
    context.registerSerializer("MyCustomType", MyCustomClass);

    // This should use the default toJSON/deserialize behavior
    const obj = Object.assign(new MyCustomClass("test"), { value: "test" });
    const serialized = context.serializeRaw(obj);
    assert.strictEqual(serialized.$serializer.type, "MyCustomType");

    // Also test registering with constructor as type parameter (line 341)
    class AnotherClass {
      data: number;
      constructor(d: number) {
        this.data = d;
      }
      static deserialize(obj: any, _metadata: any, _context: SerializerContext) {
        const instance = new AnotherClass(0);
        instance.data = obj.data;
        return instance;
      }
    }

    context.registerSerializer(AnotherClass, {
      serializer: (obj: AnotherClass) => ({ value: { data: obj.data } })
    });

    const obj2 = new AnotherClass(42);
    const serialized2 = context.serializeRaw(obj2);
    assert.strictEqual(serialized2.$serializer.type, "AnotherClass");
    assert.deepStrictEqual(serialized2.value, { data: 42 });
  }

  @test
  async testNonTypeErrorInPrepareObject() {
    // Test coverage for lines 539-540 in serializer.ts (non-TypeError branch)
    const context = new SerializerContext();

    // Create a mock WeakMap that throws a non-TypeError
    const originalSet = WeakMap.prototype.set;
    WeakMap.prototype.set = function (key: any, value: any) {
      if (key && typeof key === "object" && key.constructor?.name === "ErrorThrower") {
        throw new Error("Custom error");
      }
      return originalSet.call(this, key, value);
    };

    class ErrorThrower {
      value: number;
      constructor(val: number) {
        this.value = val;
      }
    }

    context.registerSerializer("ErrorThrower", {
      constructorType: ErrorThrower,
      serializer: (obj: ErrorThrower) => ({ value: { val: obj.value } }),
      deserializer: (obj: any) => new ErrorThrower(obj.val)
    });

    const obj = new ErrorThrower(42);

    try {
      assert.throws(() => context.serializeRaw(obj), /Custom error/);
    } finally {
      // Restore original WeakMap.set
      WeakMap.prototype.set = originalSet;
    }
  }
}
