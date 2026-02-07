import type { Constructor, Serializer, SerializerContext } from "../serializer";

/**
 * Generic serializer for plain objects and custom classes.
 *
 * Serializes objects by iterating over their enumerable properties. Does not serialize
 * methods or prototype properties. Can be configured with static properties for
 * optimized serialization of known property types.
 *
 * @example
 * ```typescript
 * // Basic object serialization (used internally for plain objects)
 * const serializer = new ObjectSerializer();
 *
 * // Custom class with known property types
 * class User {
 *   name: string;
 *   createdAt: Date;
 * }
 * const userSerializer = new ObjectSerializer(User, {
 *   createdAt: { type: "Date" }
 * });
 * registerSerializer("User", userSerializer);
 * ```
 */
export class ObjectSerializer implements Serializer<any> {
  /**
   * Create an object serializer.
   *
   * @param constructorType The constructor to use when deserializing, or null for plain objects
   * @param staticProperties Predefined serialization logic for specific properties.
   *                         When a property is defined here, its metadata is not stored in the
   *                         serialized output, reducing size. Useful for properties that always
   *                         have the same type (e.g., a `createdAt` property that's always a Date).
   *
   *                         Can be either:
   *                         - An object with a `type` field (e.g., `{ type: "Date" }`)
   *                         - A function that transforms the raw value (e.g., `(val) => new Date(val)`)
   *
   * @example
   * ```typescript
   * // Define a User class with a Date property
   * class User {
   *   name: string;
   *   createdAt: Date;
   * }
   *
   * // Create serializer with static property definition
   * const userSerializer = new ObjectSerializer(User, {
   *   createdAt: { type: "Date" }  // Always deserialize as Date
   * });
   * ```
   */
  constructor(
    public constructorType: Constructor<any> | null = null,
    protected staticProperties: Record<string, ({ type: string } & any) | ((value: any) => any)> = {}
  ) {}

  /**
   * Serialize an object by iterating over its enumerable properties.
   *
   * @param obj The object to serialize
   * @param context The serializer context for handling nested values
   * @returns The serialized value and metadata
   */
  serializer(obj: any, context: SerializerContext) {
    const newObj: { [key: string]: any } = {};
    const objMetadata: { [key: string]: any } = {};
    for (const key in obj) {
      const data = context.prepareAttribute(key, obj[key]);
      if (!data) {
        continue;
      }
      const { value, metadata } = data;
      newObj[key] = value;
      if (metadata && !this.staticProperties[key]) {
        objMetadata[key] = metadata;
      }
    }
    return { value: newObj, metadata: Object.keys(objMetadata).length ? objMetadata : undefined };
  }

  /**
   * Deserialize an object, restoring proper types for nested values.
   *
   * @param obj The raw object from JSON.parse
   * @param metadata The metadata from the serializer
   * @param context The serializer context for handling nested values and references
   * @returns The deserialized object instance
   */
  deserializer(obj: any, metadata: any, context: SerializerContext) {
    const res = new (this.constructorType || Object)();
    Object.assign(res, obj);
    for (const key in metadata) {
      if (key === "type") {
        continue;
      }
      if (
        context.isReference(obj[key], (value: any) => {
          res[key] = value; // Assign to the result object
        })
      ) {
        continue;
      }
      const serializer = context.getSerializer(metadata[key].type);
      res[key] = serializer.deserializer(obj[key], metadata[key], context);
    }
    for (const key in this.staticProperties) {
      if (typeof this.staticProperties[key] === "function") {
        res[key] = (this.staticProperties[key] as (value: any) => any)(obj[key]);
      } else {
        const serializer = context.getSerializer(this.staticProperties[key].type);
        res[key] = serializer.deserializer(obj[key], this.staticProperties[key], context);
      }
    }
    return res;
  }
}

/**
 * Serializer for objects that can be represented as strings.
 *
 * Uses the object's `toString()` method for serialization and the constructor
 * for deserialization. Suitable for types like URL, URLSearchParams, or custom
 * types with string representations.
 *
 * @example
 * ```typescript
 * // Used internally for URL serialization
 * registerSerializer("URL", new ObjectStringified(URL));
 *
 * const obj = { homepage: new URL("https://example.com") };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * // restored.homepage is a URL instance
 * ```
 */
export class ObjectStringified implements Serializer<any> {
  /**
   * Create a string-based object serializer.
   *
   * @param constructorType The constructor that accepts a string argument
   * @param staticProperties Reserved for future use
   */
  constructor(
    public constructorType: Constructor<{ toString: () => string }> | null = null,
    protected staticProperties: any = {}
  ) {}

  /**
   * Serialize an object to its string representation.
   *
   * @param obj The object to serialize
   * @param context The serializer context
   * @returns The object's string representation
   */
  serializer(obj: any, context: SerializerContext) {
    return {
      value: obj.toString()
    };
  }

  /**
   * Deserialize a string back to the object type.
   *
   * @param obj The string value from JSON.parse
   * @param metadata The metadata from the serializer
   * @param context The serializer context
   * @returns A new instance constructed from the string
   */
  deserializer(obj: any, metadata: any, context: SerializerContext) {
    return new this.constructorType!(obj);
  }
}
export default ObjectSerializer;
