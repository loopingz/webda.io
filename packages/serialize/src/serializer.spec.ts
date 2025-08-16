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
  deserializeRaw
} from "./serializer";

class Test {
  startDate: Date;
  endDate: Date;
  quantity: bigint;

  constructor() {
    this.startDate = new Date();
    this.endDate = new Date();
    this.quantity = BigInt(Math.floor(Math.random() * 1000000000000));
  }

  static fromJSON(json: any) {
    const t = new Test();
    t.startDate = new Date(json.startDate);
    t.endDate = new Date(json.endDate);
    t.quantity = BigInt(json.quantity);
    return t;
  }

  toJSON() {
    return {
      startDate: this.startDate.toISOString(),
      endDate: this.endDate.toISOString(),
      quantity: this.quantity.toString()
    };
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
        url: new URL("https://example.com")
      }
    };
    const serialized = serialize(source);
    const deserialized = deserialize(serialized);
    console.log("Serialized:", serialized);
    console.log("Deserialized:", deserialized);
    assert.deepStrictEqual(source, deserialized);
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
        deserializer: Test.fromJSON
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
}
