import ArraySerializer from "./builtin/array.js";
import ArrayBufferSerializer from "./builtin/arraybuffer.js";
import BigIntSerializer from "./builtin/bigint.js";
import BufferSerializer from "./builtin/buffer.js";
import DateSerializer from "./builtin/date.js";
import InfinitySerializer from "./builtin/infinity.js";
import NegativeInfinitySerializer from "./builtin/neginf.js";
import MapSerializer from "./builtin/map.js";
import NaNSerializer from "./builtin/nan.js";
import NullSerializer from "./builtin/null.js";
import ObjectSerializer, { ObjectStringified } from "./builtin/object.js";
import RegExpSerializer from "./builtin/regexp.js";
import SetSerializer from "./builtin/set.js";
import UndefinedSerializer from "./builtin/undefined.js";

/**
 * Define an object constructor type
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Define a serializer
 */
export type Serializer<T = any> = {
  /**
   * Constructor of the object to be serialized
   *
   * Can be null if the serializer is for specific built-in types
   * (e.g. Date, Map, Set, etc. mainly used internally)
   */
  constructorType: Constructor<T> | null;
  /**
   * Serializer function
   * @param obj
   * @param context
   * @returns {value: any, metadata?: any}
   *  The value to be serialized and optional metadata
   *  The metadata is used to store additional information about the object
   */
  serializer?: (
    obj: T,
    context: SerializerContext
  ) => {
    value: any;
    metadata?: any;
  };
  /**
   * Deserializer function, receive the raw object from JSON.parse
   * and the metadata from the serializer
   * @param obj raw object returned by JSON.parse
   * @param metadata returned by the serializer
   * @param context
   * @returns deserialized object
   */
  deserializer: (obj: any, metadata: any, context: SerializerContext) => T;
};

/**
 * Define a stored serializer
 * This is used to store the serializer in the context
 * and to register it globally
 *
 * It ensure serializer exists and has a type
 */
type StoredSerializer<T = any> = Required<Serializer<T>> & { type: string };

/**
 * Register a serializer globally for a given type
 *
 * @param type
 * @param methods
 * @param overwrite
 */
export function registerSerializer(type: string, methods: Serializer, overwrite: boolean = false): void {
  SerializerContext.globalContext.registerSerializer(type, methods, overwrite);
}

/**
 * Unregister a serializer globally for a given type
 * @param type
 */
export function unregisterSerializer(type: string): void {
  SerializerContext.globalContext.unregisterSerializer(type);
}

/**
 * Serializer context
 * This is used to store the serializers and the current state of the serialization
 * We rely on the mono-thread nature of JS to store the execution context
 *
 * It has a singleton in globalContext, instances can be created to keep a specific configuration
 *
 * @see serialize
 * @see unserialize
 * @see registerSerializer
 * @see unregisterSerializer
 */
export class SerializerContext {
  /**
   * Contains all the registered serializers per type
   */
  protected serializers: { [key: string]: StoredSerializer };

  /**
   * Contains all the registered serializer for each constructor
   */
  protected typeSerializer: WeakMap<any, StoredSerializer>;
  /**
   * Used to store the current path in the serialization
   * This is used to prevent circular references
   * and to create the $ref attribute value
   */
  stack: string[] = [];
  /**
   * Used to store the current resolvers
   * This is used to resolve references after the unserialization
   */
  resolvers?: { $ref: string; updater: (value: any) => void }[] = [];
  /**
   * Used to store the already serialized objects
   * This is used to prevent circular references
   */
  objects: WeakMap<any, string> = new WeakMap();
  /**
   * Used to store the current mode
   * This is used to prevent circular references
   */
  mode?: "serialize" | "deserialize";

  /**
   * Global context
   */
  static get globalContext(): SerializerContext {
    return globalContext;
  }

  /**
   * Constructor a new serializer context
   * @param inherit true to inherit the global context from the global context
   * if you do not inherit, you will have to register all the serializers you need
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
   * Register a serializer for a given type in this context.
   *
   * @param type – Unique string key for the serializer.
   * @param methods – Serializer and deserializer implementations.
   * @param overwrite – If true, replace any existing registration.
   * @returns this context for chaining.
   */
  public registerSerializer(type: string, methods: Serializer, overwrite: boolean = false): this {
    if (!overwrite && this.serializers[type]) {
      throw new Error(`Serializer for type '${type}' already registered for a different class`);
    }
    const info: StoredSerializer = methods as StoredSerializer;
    if (!info.serializer) {
      info.serializer = o => ({ value: o.toJSON ? o.toJSON() : o });
    }
    info.type = type;
    this.serializers[type] = info;
    if (info.constructorType) {
      this.typeSerializer.set(info.constructorType, info);
    }
    return this;
  }

  /**
   * Unregister a serializer globally for a given type.
   *
   * @param type – The type key to remove.
   * @returns this context for chaining.
   */
  public unregisterSerializer(type: string): this {
    if (this.serializers[type]) {
      this.typeSerializer.delete(this.serializers[type].constructorType);
      delete this.serializers[type];
    }
    return this;
  }

  /**
   * Retrieve a serializer by type key or by constructor function.
   *
   * @param type – The string key or constructor to look up.
   * @returns The matching Serializer.
   * @throws If no serializer is found.
   */
  public getSerializer(type: string | Constructor): Serializer {
    if (type === "ref") {
      return {
        constructor: null,
        serializer: (obj: any) => ({ value: { $ref: obj } }),
        type: "ref"
      } as any;
    }
    const serializer = typeof type === "function" ? this.typeSerializer.get(type) : this.serializers[type];
    if (serializer) {
      return serializer;
    }
    // If the serializer is not found, throw an error
    throw new Error(`Serializer for type '${typeof type === "string" ? type : type.name}' not found`);
  }

  /**
   * Push a path segment on the serialization stack.
   *
   * @param key – The segment to push.
   * @returns this context.
   */
  public push(key: string): this {
    this.stack.push(key);
    return this;
  }

  /**
   * Get the current JSON-Pointer–style path.
   *
   * @returns A string like "#/foo/bar".
   */
  public path(): string {
    return "#/" + this.stack.join("/");
  }

  /**
   * Pop the last segment off the serialization stack.
   *
   * @returns this context.
   */
  public pop(): this {
    this.stack.pop();
    return this;
  }

  /**
   * Prepare a named attribute for serialization, managing stack.
   *
   * @param attribute – The key in the parent object.
   * @param obj – The value to serialize.
   * @returns The serialized form.
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
   * Handle built-in scalar types (null, undefined, NaN, Infinity).
   *
   * @param id – Identifier of the static type.
   * @returns The serialized form or undefined if not registered.
   */
  private staticSerializer(id: "Infinity" | "-Infinity" | "null" | "undefined" | "NaN"): any {
    const entry = this.serializers[id];
    if (!entry) return undefined;
    const { value } = entry.serializer(undefined as any, this);
    return { value, metadata: { type: id } };
  }

  /**
   * Core logic to decide which serializer to invoke based on runtime type.
   *
   * @param obj – Any JS value to serialize.
   * @returns An object with `value` and optional `metadata`.
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
    } catch {
      /* ignore WeakMap errors */
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
      this.registerSerializer(obj.constructor.name, {
        constructorType: obj.constructor,
        deserializer: (o: any, metadata: any, context: SerializerContext) => obj.constructor["deserialize"](o)
      });
      serializer = this.typeSerializer.get(obj.constructor)!;
    } else if (typeof obj === "object") {
      serializer = this.serializers["object"];
    } else if (typeof obj === "number") {
      if (Number.isNaN(obj)) return this.staticSerializer("NaN");
      if (obj === Infinity) return this.staticSerializer("Infinity");
      if (obj === -Infinity) return this.staticSerializer("-Infinity");
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
   * Determine if an object is a reference placeholder and enqueue a resolver.
   *
   * @param obj – Potential {$ref: "..."} object.
   * @param updater – Function to replace the placeholder later.
   * @returns True if a reference was recorded.
   */
  public isReference(obj: any, updater: (v: any) => void): boolean {
    if (!obj || !obj.$ref) return false;
    this.resolvers!.push({ $ref: obj.$ref, updater });
    return true;
  }

  /**
   * Convert a JS value to a JSON string, keeping serializer metadata.
   *
   * @param obj – Any JS object/value.
   * @returns The JSON string representation.
   */
  public serialize(obj: any): string {
    return JSON.stringify(this.serializeRaw(obj));
  }

  /**
   * Serialize an object to a raw format, keeping serializer metadata.
   * @param obj – Any JS object/value.
   * @returns The raw serialized representation.
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
   * Resolve a JSON-Pointer reference against the root object.
   *
   * @param ref – A "#/path/..." string.
   * @param object – The root object to navigate.
   * @returns The target value.
   */
  public getReference(ref: string, object: any): any {
    if (this.mode !== "deserialize") {
      throw new Error("Cannot get reference in serialize mode");
    }
    if (!ref.startsWith("#/")) {
      throw new Error(`Invalid reference '${ref}'`);
    }
    const steps = ref.slice(2).split("/");
    let cur = object;
    for (const p of steps) {
      if (!p) continue;
      cur = cur[p];
      if (cur === undefined) {
        throw new Error(`Reference '${ref}' not found`);
      }
    }
    return cur;
  }

  /**
   * Parse a JSON string and apply registered deserializers.
   *
   * @typeparam T – Expected return type.
   * @param str – The JSON string produced by serialize().
   * @returns The reconstructed object graph.
   */
  public deserialize<T>(str: string): T {
    if (!str) {
      return undefined as T;
    }
    return this.deserializeRaw(JSON.parse(str));
  }

  /**
   * Deserialize a raw object
   * This is used to deserialize objects without the JSON.parse overhead
   * It expects an object with the value and metadata
   * @param info
   * @returns
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
      const $serializer = info.$serializer;
      delete info.$serializer; // Remove metadata before deserialization
      const value = entry.deserializer(info.value, $serializer, this);
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
 * Serialize an object into a string
 * @param obj
 * @returns
 */
export function serialize(obj: any): string {
  return SerializerContext.globalContext.serialize(obj);
}

/**
 * Return a raw serialized object
 * This is used to serialize objects without the JSON.stringify overhead
 * It returns an object with the value and metadata
 * @param obj
 * @returns
 */
export function serializeRaw(obj: any): any {
  return SerializerContext.globalContext.serializeRaw(obj);
}

/**
 * Deserialize a string into an object
 * @param str
 * @returns
 */
export function deserialize<T>(str: string): T {
  return SerializerContext.globalContext.deserialize(str);
}

/**
 * Deserialize a raw object
 * This is used to deserialize objects without the JSON.parse overhead
 * It expects an object with the value and metadata
 * @param info
 * @returns
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
  UndefinedSerializer
};
