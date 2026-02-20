import ArraySerializer from "./builtin/array.js";
import ArrayBufferSerializer from "./builtin/arraybuffer.js";
import BigIntSerializer from "./builtin/bigint.js";
import BufferSerializer from "./builtin/buffer.js";
import DateSerializer from "./builtin/date.js";
import InfinitySerializer from "./builtin/infinity.js";
import NegativeInfinitySerializer from "./builtin/neginf.js";
import NegativeZeroSerializer from "./builtin/negzero.js";
import MapSerializer from "./builtin/map.js";
import NaNSerializer from "./builtin/nan.js";
import NullSerializer from "./builtin/null.js";
import ObjectSerializer, { ObjectStringified } from "./builtin/object.js";
import RegExpSerializer from "./builtin/regexp.js";
import SetSerializer from "./builtin/set.js";
import UndefinedSerializer from "./builtin/undefined.js";

/**
 * A constructor function type that can instantiate objects of type T.
 *
 * @template T The type of object this constructor creates
 * @example
 * ```typescript
 * class MyClass {}
 * const ctor: Constructor<MyClass> = MyClass;
 * ```
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * A constructor with a static `deserialize` method for custom deserialization logic.
 *
 * Classes implementing this interface can be registered without providing explicit
 * deserializer functions - the static `deserialize` method will be used automatically.
 *
 * @template T The type of object this constructor creates
 * @example
 * ```typescript
 * class MyClass {
 *   static deserialize(obj: any, metadata: any, context: SerializerContext): MyClass {
 *     return new MyClass(obj);
 *   }
 * }
 * registerSerializer(MyClass);
 * ```
 */
export type ConstructorWithDeserialize<T = any> = Constructor<T> & {
  deserialize: (obj: any, metadata: any, context: SerializerContext) => T;
};

/**
 * Defines the serialization and deserialization behavior for a specific type.
 *
 * Serializers transform objects into JSON-compatible values while preserving type information
 * in metadata. During deserialization, the metadata is used to reconstruct the original object.
 *
 * @template T The type of object this serializer handles
 *
 * @example
 * ```typescript
 * const DateSerializer: Serializer<Date> = {
 *   constructorType: Date,
 *   serializer: (date) => ({ value: date.toISOString() }),
 *   deserializer: (isoString) => new Date(isoString)
 * };
 * ```
 */
export type Serializer<T = any> = {
  /**
   * The constructor of the type being serialized.
   *
   * Set to `null` for primitive types (bigint, null, undefined, NaN, Infinity).
   * When set, enables automatic constructor-based serializer lookup.
   *
   * @example
   * ```typescript
   * constructorType: Date  // For Date objects
   * constructorType: null  // For primitive types
   * ```
   */
  constructorType:
    | (Constructor<T> & { deserialize?: (obj: any, metadata: any, context: SerializerContext) => T })
    | null;
  /**
   * Converts an object to a JSON-compatible representation.
   *
   * Returns both the serialized value and optional metadata. Metadata is used during
   * deserialization to restore the object's original type and structure.
   *
   * @param obj The object to serialize
   * @param context The serializer context, used for handling nested objects and circular references
   * @returns An object containing the serialized value and optional metadata
   *
   * @example
   * ```typescript
   * serializer: (map: Map<any, any>, context) => {
   *   const entries = Array.from(map.entries());
   *   return {
   *     value: entries,
   *     metadata: { size: map.size }
   *   };
   * }
   * ```
   */
  serializer?: (
    obj: T,
    context: SerializerContext
  ) => {
    value: any;
    metadata?: any;
  };
  /**
   * Reconstructs the original object from its serialized representation.
   *
   * Receives the raw value from JSON.parse and the metadata produced by the serializer.
   * Should reconstruct the object with proper type information and references.
   *
   * @param obj The raw value from JSON.parse
   * @param metadata The metadata returned by the serializer
   * @param context The serializer context, used for resolving nested objects and circular references
   * @returns The reconstructed object
   *
   * @example
   * ```typescript
   * deserializer: (entries: any[], metadata, context) => {
   *   return new Map(entries);
   * }
   * ```
   */
  deserializer?: (obj: any, metadata: any, context: SerializerContext) => T;
};

/**
 * Internal representation of a registered serializer.
 *
 * Unlike the public `Serializer` type, all optional fields are required here,
 * and a unique `type` string identifier is added for metadata tracking.
 *
 * @internal
 */
type StoredSerializer<T = any> = Required<Serializer<T>> & { type: string };

/**
 * Register a serializer in the global context for a given type.
 *
 * This function allows custom types to be serialized and deserialized. There are three ways to register:
 *
 * 1. **Constructor only** - For classes with a static `deserialize` method
 * 2. **Type name + Constructor** - Explicitly name the type
 * 3. **Type name + Serializer** - Full control with custom serializer/deserializer functions
 *
 * @param type The type name string or a constructor with a static deserialize method
 * @param info Optional constructor or serializer implementation
 * @param overwrite If true, replaces an existing serializer for this type (default: false)
 * @throws Error if a serializer for this type is already registered and overwrite is false
 *
 * @example
 * ```typescript
 * // Method 1: Constructor with static deserialize
 * class User {
 *   static deserialize(obj: any) { return new User(obj); }
 * }
 * registerSerializer(User);
 *
 * // Method 2: Named constructor
 * registerSerializer("User", User);
 *
 * // Method 3: Full serializer
 * registerSerializer("User", {
 *   constructorType: User,
 *   serializer: (user) => ({ value: user.toJSON() }),
 *   deserializer: (json) => new User(json)
 * });
 * ```
 */
export function registerSerializer(type: ConstructorWithDeserialize): void;
export function registerSerializer(type: string, clazz: ConstructorWithDeserialize): void;
export function registerSerializer(type: string, methods: Serializer, overwrite?: boolean): void;
export function registerSerializer(
  type: string | ConstructorWithDeserialize,
  info?: Serializer | ConstructorWithDeserialize,
  overwrite: boolean = false
): void {
  // Delegate to the global context with the same overloads
  SerializerContext.globalContext.registerSerializer(type as any, info as any, overwrite);
}

/**
 * Remove a serializer from the global context.
 *
 * @param type The type name string to unregister
 *
 * @example
 * ```typescript
 * unregisterSerializer("User");
 * ```
 */
export function unregisterSerializer(type: string): void {
  SerializerContext.globalContext.unregisterSerializer(type);
}

/**
 * Manages serialization and deserialization state for a set of registered serializers.
 *
 * The context tracks:
 * - Registered serializers and their metadata
 * - The current object path during serialization (for circular reference detection)
 * - Pending reference resolvers during deserialization
 * - Already serialized objects (to prevent infinite loops)
 *
 * A global singleton context is available via `SerializerContext.globalContext`,
 * but you can create isolated contexts for specific use cases.
 *
 * @example
 * ```typescript
 * // Use the global context
 * const json = serialize(myObject);
 * const obj = deserialize(json);
 *
 * // Create an isolated context
 * const ctx = new SerializerContext(false);
 * ctx.registerSerializer("CustomType", mySerializer);
 * const json = ctx.serialize(myObject);
 * ```
 *
 * @see serialize
 * @see deserialize
 * @see registerSerializer
 * @see unregisterSerializer
 */
export class SerializerContext {
  /**
   * Map of type name to registered serializer.
   * Keys are strings like "Date", "Map", "User", etc.
   */
  protected serializers: { [key: string]: StoredSerializer };

  /**
   * Map from constructor function to its serializer.
   * Allows fast lookup when serializing objects by their constructor.
   * Uses WeakMap to avoid preventing garbage collection of unused constructors.
   */
  protected typeSerializer: WeakMap<any, StoredSerializer>;

  /**
   * The current path during serialization, represented as an array of property names.
   *
   * Example: When serializing `{user: {posts: [...]}}`, the stack might be `["user", "posts", "0"]`.
   * This is used to generate JSON-Pointer references like `#/user/posts/0` for circular references.
   */
  stack: string[] = [];

  /**
   * Queue of deferred reference resolutions during deserialization.
   *
   * When encountering a `{$ref: "#/path"}` placeholder, the resolver is added here
   * and executed after the full object graph is reconstructed.
   */
  resolvers?: { $ref: string; updater: (value: any) => void }[] = [];

  /**
   * Map from object instance to its JSON-Pointer path.
   *
   * Tracks objects encountered during serialization to detect circular references.
   * When an object is seen again, a reference placeholder is emitted instead of re-serializing.
   */
  objects: WeakMap<any, string> = new WeakMap();

  /**
   * Current operation mode: "serialize" or "deserialize".
   *
   * Used to enforce correct API usage (e.g., getReference only works during deserialization).
   */
  mode?: "serialize" | "deserialize";

  /**
   * The global singleton serializer context.
   *
   * This is used by the top-level `serialize()`, `deserialize()`, and `registerSerializer()`
   * functions. All built-in types (Date, Map, Set, etc.) are pre-registered here.
   *
   * @example
   * ```typescript
   * SerializerContext.globalContext.registerSerializer("MyType", mySerializer);
   * ```
   */
  static get globalContext(): SerializerContext {
    return globalContext;
  }

  /**
   * Create a new serializer context.
   *
   * @param inherit If true (default), copies all serializers from the global context.
   *                If false, starts with an empty context requiring manual serializer registration.
   *
   * @example
   * ```typescript
   * // Inherit built-in serializers
   * const ctx = new SerializerContext();
   *
   * // Start fresh (no built-in serializers)
   * const emptyCtx = new SerializerContext(false);
   * emptyCtx.registerSerializer("Date", DateSerializer);
   * ```
   */
  constructor(inherit: boolean = true) {
    // Initialize the serializer context
    this.serializers = {};
    this.typeSerializer = new WeakMap();
    if (inherit && globalContext) {
      // Inherit serializers from the global context
      for (const key in globalContext.serializers) {
        this.registerSerializer(key, globalContext.serializers[key], true);
      }
    }
  }

  /**
   * Register a serializer in this context.
   *
   * See the global {@link registerSerializer} function for detailed usage examples.
   *
   * @param type The type name string or a constructor with a static deserialize method
   * @param info Optional constructor or serializer implementation
   * @param overwrite If true, replaces an existing serializer for this type
   * @returns This context for method chaining
   * @throws Error if a serializer for this type is already registered and overwrite is false
   * @throws Error if no deserializer is provided and the constructor lacks a static deserialize method
   */
  public registerSerializer(type: ConstructorWithDeserialize): this;
  public registerSerializer(type: string, clazz: ConstructorWithDeserialize): this;
  public registerSerializer(type: string, methods: Serializer, overwrite?: boolean): this;
  public registerSerializer(
    type: string | ConstructorWithDeserialize,
    info?: Serializer | ConstructorWithDeserialize,
    overwrite: boolean = false
  ): this {
    // Handle overload resolution
    const methods: Partial<Serializer> = typeof info === "object" && info !== null ? info : {};
    const typeName = typeof type === "string" ? type : type.name;
    if (typeof type !== "string") {
      methods.constructorType = type;
    } else if (typeof info === "function") {
      methods.constructorType = info;
    }

    // Validate and register
    if (!overwrite && this.serializers[typeName]) {
      throw new Error(
        `Serializer for type '${typeName}' is already registered. ` +
        `Use overwrite=true to replace it, or call unregisterSerializer('${typeName}') first.`
      );
    }
    const info2: StoredSerializer = methods as StoredSerializer;
    if (!info2.serializer) {
      info2.serializer = o => ({ value: o.toJSON ? o.toJSON() : o });
    }
    if (!info2.deserializer) {
      if (info2.constructorType && typeof info2.constructorType["deserialize"] === "function") {
        info2.deserializer = (o: any, metadata: any, context: SerializerContext) =>
          info2.constructorType!["deserialize"]!(o, metadata, context);
      } else {
        throw new Error(`Deserializer is required for type '${typeName}'`);
      }
    }
    info2.type = typeName;
    this.serializers[typeName] = info2;
    if (info2.constructorType) {
      this.typeSerializer.set(info2.constructorType, info2);
    }
    return this;
  }

  /**
   * Remove a serializer from this context.
   *
   * @param type The type name string to unregister
   * @returns This context for method chaining
   */
  public unregisterSerializer(type: string): this {
    if (this.serializers[type]) {
      this.typeSerializer.delete(this.serializers[type].constructorType);
      delete this.serializers[type];
    }
    return this;
  }

  /**
   * Retrieve a registered serializer by type name or constructor.
   *
   * @param type The string type name or constructor function to look up
   * @returns The matching stored serializer
   * @throws Error if no serializer is registered for this type
   *
   * @example
   * ```typescript
   * const dateSerializer = context.getSerializer("Date");
   * const mapSerializer = context.getSerializer(Map);
   * ```
   */
  public getSerializer(type: string | Constructor): StoredSerializer {
    if (type === "ref") {
      return {
        constructorType: null,
        serializer: (obj: any) => ({ value: { $ref: obj } }),
        deserializer: (obj: any) => obj, // Should never be called for ref placeholders
        type: "ref"
      };
    }
    const serializer = typeof type === "function" ? this.typeSerializer.get(type) : this.serializers[type];
    if (serializer) {
      return serializer;
    }
    // If the serializer is not found, throw an error with helpful guidance
    const typeName = typeof type === "string" ? type : type.name;
    throw new Error(
      `Serializer for type '${typeName}' not found. ` +
      `Did you forget to call registerSerializer('${typeName}', ...)?`
    );
  }

  /**
   * Push a path segment onto the serialization stack.
   *
   * Used internally to track the current location in the object graph.
   *
   * @param key The property name or array index to push
   * @returns This context for method chaining
   */
  public push(key: string): this {
    this.stack.push(key);
    return this;
  }

  /**
   * Get the current path as a JSON-Pointer string.
   *
   * JSON-Pointer format (RFC 6901) uses slashes to separate path segments.
   *
   * @returns A JSON-Pointer string like "#/user/posts/0"
   *
   * @example
   * ```typescript
   * context.push("user").push("posts").push("0");
   * context.path(); // Returns "#/user/posts/0"
   * ```
   */
  public path(): string {
    return "#/" + this.stack.join("/");
  }

  /**
   * Remove the last segment from the serialization stack.
   *
   * Used internally when exiting a nested object or array element.
   *
   * @returns This context for method chaining
   */
  public pop(): this {
    this.stack.pop();
    return this;
  }

  /**
   * Serialize a nested object property, managing the path stack.
   *
   * This method is typically called by serializers when processing object properties
   * to maintain correct path tracking for circular reference detection.
   *
   * @param attribute The property name in the parent object
   * @param obj The value to serialize
   * @returns The serialized representation with value and optional metadata
   *
   * @example
   * ```typescript
   * // Inside a custom serializer
   * serializer: (obj, context) => {
   *   const serializedName = context.prepareAttribute("name", obj.name);
   *   return { value: { name: serializedName.value } };
   * }
   * ```
   */
  public prepareAttribute(attribute: string, obj: any): any {
    try {
      this.push(attribute);
      return this.prepareObject(obj);
    } finally {
      this.pop();
    }
  }

  /**
   * Serialize special JavaScript values that cannot be represented in JSON.
   *
   * Handles: null, undefined, NaN, Infinity, -Infinity
   *
   * @param id The identifier of the special value type
   * @returns The serialized form with metadata, or undefined if not registered
   * @internal
   */
  private staticSerializer(id: "Infinity" | "-Infinity" | "null" | "undefined" | "NaN" | "-0"): any {
    const entry = this.serializers[id];
    if (!entry) return undefined;
    const { value } = entry.serializer(undefined as any, this);
    return { value, metadata: { type: id } };
  }

  /**
   * Determine the appropriate serializer for an object and serialize it.
   *
   * This is the core serialization logic that:
   * 1. Detects circular references and emits `{$ref: "..."}` placeholders
   * 2. Chooses the correct serializer based on the object's type
   * 3. Handles primitives (string, number, boolean) directly
   * 4. Returns symbols and functions as undefined
   * 5. Throws an error if an object has a deserialize method but isn't registered
   *
   * @param obj Any JavaScript value to serialize
   * @returns An object containing the serialized value and optional metadata
   * @throws Error if a serializer is required but not found
   * @internal
   */
  private prepareObject(obj: any): { value: any; metadata?: any } {
    // Handle circular references
    if (obj && this.objects.has(obj)) {
      return {
        value: { $ref: this.objects.get(obj) },
        metadata: { type: "ref" }
      };
    }
    try {
      this.objects.set(obj, this.path());
    } catch (error) {
      // WeakMap throws TypeError for non-object keys (primitives like strings, numbers)
      // This is expected and safe to ignore during serialization
      if (error instanceof TypeError) {
        // Silently ignore - primitives don't need circular reference tracking
      } else {
        // Re-throw unexpected errors (e.g., out of memory)
        throw error;
      }
    }

    let serializer: StoredSerializer | undefined;
    if (typeof obj === "bigint") {
      serializer = this.serializers["bigint"];
    } else if (obj === null) {
      return this.staticSerializer("null");
    } else if (obj === undefined) {
      return this.staticSerializer("undefined");
    } else if (typeof obj === "object" && this.typeSerializer.has(obj.constructor)) {
      serializer = this.typeSerializer.get(obj.constructor)!;
    } else if (typeof obj === "object" && obj.constructor && typeof obj.constructor["deserialize"] === "function") {
      // If two objects have same class name without being the same constructor it will fail
      throw new Error(
        `Serializer for object with constructor '${obj.constructor.name}' not found but a deserializer exists, please use registerSerializer(${obj.constructor.name}) prior to serialization`
      );
    } else if (typeof obj === "object") {
      serializer = this.serializers["object"];
    } else if (typeof obj === "number") {
      if (Number.isNaN(obj)) return this.staticSerializer("NaN");
      if (obj === Infinity) return this.staticSerializer("Infinity");
      if (obj === -Infinity) return this.staticSerializer("-Infinity");
      if (Object.is(obj, -0)) return this.staticSerializer("-0");
      return { value: obj };
    } else if (typeof obj === "string" || typeof obj === "boolean") {
      return { value: obj };
    } else if (typeof obj === "symbol" || typeof obj === "function") {
      return { value: undefined };
    }

    if (!serializer) {
      throw new Error(`Serializer for type '${typeof obj}' not found`);
    }
    const { value, metadata } = serializer.serializer(obj, this);
    if (serializer.type === "object" && metadata == undefined) {
      return { value };
    }
    return { value, metadata: { ...metadata, type: serializer.type } };
  }

  /**
   * Check if a value is a circular reference placeholder and queue it for resolution.
   *
   * During deserialization, when a `{$ref: "#/path"}` placeholder is encountered,
   * this method records it for later resolution after the full object graph is built.
   *
   * @param obj The value to check (should be `{$ref: "..."}` for circular references)
   * @param updater Callback to update the placeholder once the referenced object is available
   * @returns True if this is a reference placeholder, false otherwise
   *
   * @example
   * ```typescript
   * // Inside a custom deserializer
   * if (context.isReference(obj.parent, (value) => { obj.parent = value; })) {
   *   // Parent is a circular reference, will be resolved later
   * }
   * ```
   */
  public isReference(obj: any, updater: (v: any) => void): boolean {
    if (!obj || !obj.$ref) return false;
    this.resolvers!.push({ $ref: obj.$ref, updater });
    return true;
  }

  /**
   * Serialize a JavaScript value to a JSON string.
   *
   * This method converts objects to JSON while preserving type information
   * through metadata. Handles circular references, custom types, and special
   * JavaScript values (undefined, NaN, Infinity, etc.).
   *
   * @param obj Any JavaScript value to serialize
   * @returns A JSON string that can be passed to {@link deserialize}
   *
   * @example
   * ```typescript
   * const obj = {
   *   date: new Date(),
   *   map: new Map([["key", "value"]]),
   *   bigint: 123n
   * };
   * const json = context.serialize(obj);
   * ```
   */
  public serialize(obj: any): string {
    return JSON.stringify(this.serializeRaw(obj));
  }

  /**
   * Serialize an object to raw format without JSON.stringify.
   *
   * Useful for performance-sensitive scenarios or when you need to manipulate
   * the serialized representation before converting to JSON.
   *
   * @param obj Any JavaScript value to serialize
   * @returns An object containing `value` and `$serializer` metadata, or just the value for primitives
   *
   * @example
   * ```typescript
   * const raw = context.serializeRaw({ date: new Date() });
   * // raw = { value: { date: "2024-01-01T00:00:00.000Z" }, $serializer: { ... } }
   * const json = JSON.stringify(raw);
   * ```
   */
  public serializeRaw(obj: any): { value: any; $serializer: any } {
    this.mode = "serialize";
    try {
      this.stack = [];
      this.objects = new WeakMap();
      const { value, metadata } = this.prepareObject(obj);
      if (!metadata) {
        return value;
      }
      // If the value is an object, we need to add the metadata to the object
      return { $serializer: metadata, value };
    } finally {
      this.mode = undefined;
    }
  }

  /**
   * Resolve a JSON-Pointer reference to its target object.
   *
   * Follows RFC 6901 JSON-Pointer format to navigate the object graph.
   * Only available during deserialization mode.
   *
   * @param ref A JSON-Pointer string like "#/user/posts/0"
   * @param object The root object to navigate from
   * @returns The value at the referenced path
   * @throws Error if called outside deserialization mode
   * @throws Error if the reference format is invalid
   * @throws Error if the referenced path doesn't exist
   *
   * @example
   * ```typescript
   * const root = { user: { posts: ["Hello"] } };
   * const value = context.getReference("#/user/posts/0", root);
   * // value = "Hello"
   * ```
   */
  public getReference(ref: string, object: any): any {
    if (this.mode !== "deserialize") {
      throw new Error("Cannot get reference in serialize mode");
    }
    if (!ref.startsWith("#/")) {
      throw new Error(`Invalid reference '${ref}': must start with '#/'`);
    }

    // Split and filter out empty segments
    const steps = ref.slice(2).split("/").filter(Boolean);
    let cur = object;

    for (const p of steps) {
      // Decode JSON-Pointer escape sequences (RFC 6901)
      // ~1 becomes /, ~0 becomes ~
      const decoded = p.replace(/~1/g, '/').replace(/~0/g, '~');

      // Check if current value is traversable
      if (cur === null || cur === undefined) {
        throw new Error(
          `Reference '${ref}' failed: cannot traverse null/undefined at segment '${decoded}'`
        );
      }

      cur = cur[decoded];

      if (cur === undefined) {
        throw new Error(
          `Reference '${ref}' not found: property '${decoded}' does not exist`
        );
      }
    }
    return cur;
  }

  /**
   * Deserialize a JSON string to reconstruct the original JavaScript object graph.
   *
   * Parses the JSON string and applies registered deserializers to restore
   * proper types, circular references, and custom objects.
   *
   * @template T The expected return type
   * @param str A JSON string produced by {@link serialize}
   * @returns The reconstructed object with proper types
   * @throws Error if a required serializer is not registered
   *
   * @example
   * ```typescript
   * const json = '{"value":{"date":"2024-01-01T00:00:00.000Z"},"$serializer":{...}}';
   * const obj = context.deserialize<{ date: Date }>(json);
   * // obj.date is a Date instance, not a string
   * ```
   */
  public deserialize<T>(str: string): T {
    if (!str) {
      return undefined as T;
    }
    return this.deserializeRaw(JSON.parse(str));
  }

  /**
   * Deserialize a raw object without JSON.parse.
   *
   * Useful when you already have a parsed object or need to avoid
   * the JSON.parse overhead. Expects an object with `value` and `$serializer` metadata.
   *
   * @template T The expected return type
   * @param info An object containing `value` and `$serializer` metadata
   * @returns The reconstructed object with proper types
   * @throws Error if a required serializer is not registered
   *
   * @example
   * ```typescript
   * const raw = { value: { date: "2024-01-01T00:00:00.000Z" }, $serializer: { type: "object", ... } };
   * const obj = context.deserializeRaw<{ date: Date }>(raw);
   * ```
   */
  public deserializeRaw<T>(info: { value: any; $serializer: any }): T {
    this.mode = "deserialize";
    this.resolvers = [];
    try {
      if (!info || !info.$serializer) {
        return info as T;
      }
      const entry = this.serializers[info.$serializer.type];
      if (!entry) {
        throw new Error(`Serializer for type '${info.$serializer.type}' not found`);
      }
      // Extract metadata without mutating the input object
      const { $serializer, value: inputValue } = info;
      const value = entry.deserializer(inputValue, $serializer, this);
      // Fix up circular references
      this.resolvers.forEach(r => {
        r.updater(this.getReference(r.$ref, value));
      });
      return value;
    } finally {
      this.mode = undefined;
    }
  }
}

// Create a global context for the serializer
const globalContext: SerializerContext = new SerializerContext(false);

/**
 * Serialize a JavaScript value to a JSON string using the global context.
 *
 * This is a convenience wrapper around `SerializerContext.globalContext.serialize()`.
 * All built-in types (Date, Map, Set, Buffer, etc.) are automatically supported.
 *
 * @param obj Any JavaScript value to serialize
 * @returns A JSON string that can be passed to {@link deserialize}
 *
 * @example
 * ```typescript
 * const obj = {
 *   date: new Date(),
 *   map: new Map([["key", "value"]]),
 *   nested: { bigint: 123n }
 * };
 * const json = serialize(obj);
 * ```
 *
 * @see SerializerContext.serialize
 */
export function serialize(obj: any): string {
  return SerializerContext.globalContext.serialize(obj);
}

/**
 * Serialize an object to raw format without JSON.stringify using the global context.
 *
 * This is a convenience wrapper around `SerializerContext.globalContext.serializeRaw()`.
 * Useful when you need to manipulate the serialized data before converting to JSON.
 *
 * @param obj Any JavaScript value to serialize
 * @returns An object containing `value` and `$serializer` metadata, or just the value for primitives
 *
 * @example
 * ```typescript
 * const raw = serializeRaw({ date: new Date() });
 * // Manipulate raw before stringifying
 * const json = JSON.stringify(raw);
 * ```
 *
 * @see SerializerContext.serializeRaw
 */
export function serializeRaw(obj: any): any {
  return SerializerContext.globalContext.serializeRaw(obj);
}

/**
 * Deserialize a JSON string to reconstruct the original object using the global context.
 *
 * This is a convenience wrapper around `SerializerContext.globalContext.deserialize()`.
 * Restores proper types for Date, Map, Set, and all registered custom types.
 *
 * @template T The expected return type
 * @param str A JSON string produced by {@link serialize}
 * @returns The reconstructed object with proper types
 * @throws Error if a required serializer is not registered
 *
 * @example
 * ```typescript
 * const json = serialize({ date: new Date() });
 * const obj = deserialize<{ date: Date }>(json);
 * console.log(obj.date instanceof Date); // true
 * ```
 *
 * @see SerializerContext.deserialize
 */
export function deserialize<T>(str: string): T {
  return SerializerContext.globalContext.deserialize(str);
}

/**
 * Deserialize a raw object without JSON.parse using the global context.
 *
 * This is a convenience wrapper around `SerializerContext.globalContext.deserializeRaw()`.
 * Useful when you already have a parsed object structure.
 *
 * @template T The expected return type
 * @param info An object containing `value` and `$serializer` metadata
 * @returns The reconstructed object with proper types
 * @throws Error if a required serializer is not registered
 *
 * @example
 * ```typescript
 * const raw = serializeRaw({ date: new Date() });
 * const obj = deserializeRaw<{ date: Date }>(raw);
 * ```
 *
 * @see SerializerContext.deserializeRaw
 */
export function deserializeRaw<T>(info: { value: any; $serializer: any }): T {
  return SerializerContext.globalContext.deserializeRaw(info);
}

// Register the built-in serializers
registerSerializer("Date", DateSerializer);
registerSerializer("Map", MapSerializer);
registerSerializer("Set", SetSerializer);
registerSerializer("Buffer", BufferSerializer);
registerSerializer("ArrayBuffer", ArrayBufferSerializer);
registerSerializer("RegExp", RegExpSerializer);
registerSerializer("URL", new ObjectStringified(URL));
registerSerializer("bigint", BigIntSerializer);
registerSerializer("array", ArraySerializer);
registerSerializer("object", new ObjectSerializer());
registerSerializer("null", NullSerializer);
registerSerializer("Infinity", InfinitySerializer);
registerSerializer("-Infinity", NegativeInfinitySerializer);
registerSerializer("NaN", NaNSerializer);
registerSerializer("undefined", UndefinedSerializer);
registerSerializer("-0", NegativeZeroSerializer);

// Re-export the built-in serializers
export {
  DateSerializer,
  MapSerializer,
  SetSerializer,
  BufferSerializer,
  ArrayBufferSerializer,
  RegExpSerializer,
  BigIntSerializer,
  ArraySerializer,
  ObjectSerializer,
  ObjectStringified,
  NullSerializer,
  InfinitySerializer,
  NegativeInfinitySerializer,
  NaNSerializer,
  UndefinedSerializer,
  NegativeZeroSerializer
};
