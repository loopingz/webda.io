import { registerSerializer, hasSerializer, SerializerContext, Constructor } from "./serializer";
import * as assert from "assert";

/** Multi-factor authentication token with serialize/deserialize support. */
class MFA {
  secret: string = "";
  /** Create an MFA instance with an optional secret.
   * @param secret - the MFA secret value
   */
  constructor(secret: string = "") {
    this.secret = secret;
  }
  /**
   * Convert to a data-transfer object indicating whether MFA is enabled.
   *
   * @returns the DTO with enabled flag
   */
  toDTO() {
    return {enabled: this.secret !== ""}
  }
  /**
   * Reconstruct an MFA from a DTO (no-op placeholder).
   *
   * @param dto - the DTO to reconstruct from
   */
  static fromDTO(dto: never): void {
    
  }
  /**
   * Reconstruct an MFA instance from serialized data.
   *
   * @param data - the serialized data
   * @param data.secret - the MFA secret
   * @returns the reconstructed MFA instance
   */
  static deserialize(data: {secret: string}): MFA {
    return new MFA(data.secret);
  }
}

const WEBDA_FIELDS = Symbol("webda_fields");

type FieldDefinition = {
  fromDTO?: (dto: any) => any;
  deserialize?: (dto: any) => any;
  instance?: Constructor<any>;
} | Constructor<any>;
interface WithFields {
  new (...args: any[]): any;
  [WEBDA_FIELDS]: Record<string, FieldDefinition>;
}

/** Example model with Date and MFA fields for testing serialization round-trips. */
class AClass {
  static [WEBDA_FIELDS]: Record<string, FieldDefinition> = {
    date: Date,
    mfa: MFA
  };
  date: Date = new Date();
  mfa: MFA = new MFA();

  /**
   * Serialize this instance to a JSON string using the global context.
   *
   * @returns the JSON string
   */
  serialize() {
    const data = SerializerContext.globalContext.serializeRaw(this);
    return JSON.stringify(data.value);
  }

  /**
   * Deserialize a JSON string or plain object into a class instance, restoring typed fields.
   *
   * @param value - JSON string or plain object to deserialize
   * @param instance - optional existing instance to populate
   * @returns the deserialized class instance
   */
  static deserialize<T extends WithFields>(this: T, value: string | Record<string, any> = {}, instance?: InstanceType<T>): InstanceType<T> {
    let data: any = value;
    if (typeof value === "string") {
      data = JSON.parse(value);
    }
    instance ??= new this();
    const fields: any = this[WEBDA_FIELDS];
    console.log("Deserializing", this.name, fields, (value as any)["otherDate"]);
    Object.assign(instance!, data);
    for (const key in fields) {
      if (hasSerializer(fields[key])) {
        console.log("Deserializing field", key, "with value", data[key]);
        // @ts-ignore
        instance[key] = SerializerContext.globalContext.deserialize(data[key], fields[key]);
        // @ts-ignore
        continue;
      }
    }
    console.log("Deserialized instance", instance);
    return instance!;
  }
}

/** Extended model adding an extra Date field to verify inherited serialization. */
class BClass extends AClass {
  static [WEBDA_FIELDS]: Record<string, FieldDefinition> = {
    ...AClass[WEBDA_FIELDS],
    otherDate: Date
  };
  name!: string;
  otherDate!: Date;
}

registerSerializer(AClass);
registerSerializer(BClass);

const dt = new Date(86400000);
const a = new AClass();
a.date = dt;
a.mfa.secret = "secret";
const aS = a.serialize();
const b = new BClass();
b.date = dt;
b.otherDate = dt;
b.name = "Test";
b.mfa.secret = "124";
const bS = b.serialize();
console.log("Serialized B", bS);
setTimeout(() => {
  const ap = AClass.deserialize(aS);
  assert.ok(ap.date.getTime() === dt.getTime());
  const bp = BClass.deserialize(bS);
  console.log("Deserialized B", bp);
  assert.ok(bp.date.getTime() === dt.getTime());
  assert.ok(bp.otherDate.getTime() === dt.getTime());
  assert.ok(bp.name === "Test");
}, 100);
