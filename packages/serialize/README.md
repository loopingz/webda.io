# @webda/serialize

This package provides a set of functions to serialize and deserialize JavaScript objects with extensible support for custom types. It is designed to be used in environments where you need to convert complex objects into a format that can be easily stored or transmitted, such as JSON.

Package like `serialize-javascript` and `flatted` are great for serializing JavaScript objects, but they don't support custom types out of the box. This package allows you to define custom serialization and deserialization logic for your own types.

## Features

- Serialize and deserialize JavaScript objects, including custom types.
- Support for circular references.
- Support for custom serialization and deserialization functions.
- Support for null and undefined values.
- Support for Map and Set types.
- Support for Date and RegExp types.
- Support for BigInt type.
- Support for ArrayBuffer and TypedArray types.
- Support for Buffer type.
- Support for NaN and Infinity values.

## Example

### Native types

With a sample object like this:

```javascript
{
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
        regex: /hello/i,
        url: new URL("https://example.com")
    }
}
```

JSON.stringify would generate this outcome:

```
{"date":"2023-10-01T00:00:00.000Z","map":{},"null":null,"infinity":null,"nan":null,"set":{},"array":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"arrayBuffer":{},"subobject":{"buffer":{"type":"Buffer","data":[72,101,108,108,111,44,32,119,111,114,108,100,33]},"regex":{},"url":"https://example.com/"}}
```

You can see that the map and set are serialized as empty objects, and the date is serialized as a string. The array buffer is also serialized as an empty object, and the buffer is serialized as a JSON object with a type and data property. The regex is serialized as an empty object, and the URL is serialized as a string.
The infinity and NaN values are serialized as null, and the null value is preserved. The undefined value is also removed (which is not a big issue).

Our serializer will generate this:

```
{"$serializer":{"date":{"type":"Date"},"map":{"key4":{"type":"Date"},"type":"Map"},"null":{"type":"null"},"infinity":{"type":"Infinity"},"nan":{"type":"NaN"},"undefined":{"type":"undefined"},"set":{"5":{"type":"Date"},"type":"Set"},"array":{"5":{"type":"Date"},"type":"array"},"arrayBuffer":{"type":"ArrayBuffer"},"subobject":{"buffer":{"type":"Buffer"},"bigint":{"type":"bigint"},"regex":{"type":"RegExp"},"url":{"type":"URL"},"type":"object"},"type":"object"},"date":"2023-10-01T00:00:00.000Z","map":{"key":"value","key2":12,"key3":true,"key4":"2024-10-01T00:00:00.000Z"},"null":null,"infinity":null,"nan":null,"set":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"array":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"arrayBuffer":[1,2,3,4,5,6,7,8],"subobject":{"buffer":[72,101,108,108,111,44,32,119,111,114,108,100,33],"bigint":"12345678901234567168","regex":"/hello/i","url":"https://example.com/"}}
```

It will then use the `$serializer` key to restore types in the deserialization process.

### Circular references

With a sample object like this:

```javascript
const obj = {
  a: 1,
  b: 2,
  c: {
    d: 3,
    e: 4
  }
};
obj.c.f = obj;
obj.c.g = obj.c;
```

JSON.stringify would generate this outcome:

```
TypeError: Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    |     property 'c' -> object with constructor 'Object'
    --- property 'f' closes the circle
```

Our serializer will generate this:

```
{"$serializer":{"c":{"f":{"type":"ref"},"g":{"type":"ref"},"type":"object"},"type":"object"},"a":1,"b":2,"c":{"d":3,"e":4,"f":{"$ref":"#/"},"g":{"$ref":"#/c"}}}
```

The `$ref` key will be used to restore the circular references in the deserialization process.

## Custom Serializers

You can register your own serializers for custom classes. This is useful when you have domain-specific types that need special handling during serialization and deserialization.

### Quick Start: Simplest Registration

The easiest way to make a class serializable is to add a static `deserialize` method and optionally a `toJSON` method, then register the class:

```typescript
import { registerSerializer, serialize, deserialize } from "@webda/serialize";

class Person {
  constructor(
    public firstName: string,
    public lastName: string,
    public birthDate: Date
  ) {}

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  toJSON() {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      birthDate: this.birthDate
    };
  }

  static deserialize(data: any): Person {
    return new Person(data.firstName, data.lastName, data.birthDate);
  }
}

// Simple one-line registration
registerSerializer(Person);

// Now you can serialize and deserialize Person objects
const person = new Person("John", "Doe", new Date("1990-01-01"));
const serialized = serialize(person);
const restored = deserialize<Person>(serialized);

console.log(restored.fullName); // "John Doe"
console.log(restored instanceof Person); // true
```

### Creating a Custom Serializer with Full Control

For more complex scenarios, a serializer can implement the `Serializer` interface with three main components:

1. `constructorType`: The class constructor to serialize
2. `serializer`: A function that converts your object to a serializable format (optional if `toJSON` exists)
3. `deserializer`: A function that reconstructs your object from the serialized data (optional if static `deserialize` exists)

Here's an example with explicit serializer and deserializer (useful when you need custom logic):

```typescript
import { registerSerializer, serialize, deserialize } from "@webda/serialize";

class CustomPerson {
  constructor(
    public firstName: string,
    public lastName: string,
    public age: number
  ) {}

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}

// Explicit registration with custom serializer and deserializer
registerSerializer("CustomPerson", {
  constructorType: CustomPerson,
  serializer: (person, context) => ({
    value: {
      // Custom serialization: store as array for compact representation
      data: [person.firstName, person.lastName, person.age]
    }
  }),
  deserializer: (data, metadata, context) => {
    // Custom deserialization: reconstruct from array
    return new CustomPerson(data.data[0], data.data[1], data.data[2]);
  }
});

const person = new CustomPerson("John", "Doe", 33);
const serialized = serialize(person);
const restored = deserialize<CustomPerson>(serialized);

console.log(restored.fullName); // "John Doe"
console.log(restored instanceof CustomPerson); // true
```

### Using Metadata

The serializer can return metadata that will be passed to the deserializer. This is useful for storing additional information:

```typescript
class ComplexNumber {
  constructor(public real: number, public imaginary: number) {}
}

registerSerializer("ComplexNumber", {
  constructorType: ComplexNumber,
  serializer: (num, context) => ({
    value: [num.real, num.imaginary],
    metadata: { version: 1 } // Additional metadata
  }),
  deserializer: (data, metadata, context) => {
    // You can check metadata.version for backwards compatibility
    return new ComplexNumber(data[0], data[1]);
  }
});
```

### Simplified Registration with Static Deserializer

The `registerSerializer` function now has multiple overloaded signatures for simplified registration. If your class has a static `deserialize` method, you can use one of these convenient patterns:

#### Option 1: Register with just the class (shortest form)

```typescript
class SimpleClass {
  constructor(public data: string) {}

  toJSON() {
    return { data: this.data };
  }

  static deserialize(data: any, metadata: any, context: SerializerContext): SimpleClass {
    return new SimpleClass(data.data);
  }
}

// Just pass the class - uses class name as type identifier
registerSerializer(SimpleClass);

const obj = new SimpleClass("test");
const serialized = serialize(obj);
const restored = deserialize<SimpleClass>(serialized);
```

#### Option 2: Register with custom type name and class

```typescript
class MyClass {
  constructor(public value: number) {}

  static deserialize(data: any, metadata: any, context: SerializerContext): MyClass {
    return new MyClass(data.value);
  }
}

// Custom type name with class
registerSerializer("CustomTypeName", MyClass);
```

#### Option 3: Full control with serializer object

```typescript
class AutoSerializable {
  constructor(public value: string) {}

  static deserialize(data: any, metadata: any, context: SerializerContext): AutoSerializable {
    return new AutoSerializable(data.value);
  }
}

// Provide custom serializer, deserializer is auto-resolved from static method
registerSerializer("AutoSerializable", {
  constructorType: AutoSerializable,
  serializer: (obj) => ({ value: { value: obj.value } })
  // deserializer is automatically set to AutoSerializable.deserialize
});
```

**How it works:**
- If you only provide a class (or type name + class), the serializer will use `toJSON()` if available, or default serialization otherwise
- The deserializer is automatically resolved from the static `deserialize` method
- The class name is used as the type identifier unless you specify a custom name

Note: This approach still requires explicit registration with `registerSerializer`. For automatic registration on first use, see the next section.

### Registration is Required

**Important:** If you attempt to serialize a class with a static `deserialize` method without explicitly registering it first, the serializer will throw an error:

```typescript
class NotRegistered {
  constructor(public name: string) {}

  static deserialize(data: any): NotRegistered {
    return new NotRegistered(data.name);
  }
}

const obj = new NotRegistered("test");
const serialized = serialize(obj); // ❌ Throws error: Serializer not found but a deserializer exists
```

**Why explicit registration is required:**
- Prevents ambiguity when two classes have the same name but different constructors
- Makes it clear which types are serializable in your codebase
- Ensures both sender and receiver agree on type identifiers
- Better for distributed systems where sender and receiver may have different code versions

**Solution:** Always register your classes explicitly:

```typescript
registerSerializer(NotRegistered); // ✅ Now it works
const serialized = serialize(obj);
```

### Context-Specific Serializers

You can create a custom `SerializerContext` for different serialization needs. The `registerSerializer` method on contexts supports all the same overloaded signatures as the global function:

```typescript
import { SerializerContext } from "@webda/serialize";

class MyClass {
  constructor(public value: number) {}

  static deserialize(data: any, metadata: any, context: SerializerContext): MyClass {
    return new MyClass(data.value);
  }
}

// Create a custom context (inherits built-in serializers by default)
const customContext = new SerializerContext();

// All registration styles work with custom contexts:
customContext.registerSerializer(MyClass);  // Simple registration

// Or with custom type name
customContext.registerSerializer("MyType", MyClass);

// Or with full control
customContext.registerSerializer("MyType", {
  constructorType: MyClass,
  serializer: (obj) => ({ value: obj.value }),
  deserializer: (data) => MyClass.fromJSON(data)
});

const serialized = customContext.serialize(myObject);
const restored = customContext.deserialize<MyClass>(serialized);
```

This is useful when you need different serialization strategies for different use cases (e.g., one for storage, another for network transmission).

### Handling Nested Objects

The serializer context automatically handles nested objects and circular references. When serializing nested objects, use `context.prepareAttribute`:

```typescript
class Container {
  constructor(public items: Person[]) {}
}

registerSerializer("Container", {
  constructorType: Container,
  serializer: (container, context) => ({
    value: {
      items: container.items.map((item, i) =>
        context.prepareAttribute(`items.${i}`, item)
      )
    }
  }),
  deserializer: (data, metadata, context) => {
    return new Container(data.items);
  }
});
```
