/**
 * Service parameter shapes for the schema converter tests.
 *
 * Each class here is a service whose parameters exercise one part of the
 * converter, so a failure names the feature rather than "the fixture".
 */
import { Service, ServiceParameters } from "./runtime.js";

/** An alias carrying its own annotation. */
export type Port = number;

/** Log levels, in declaration order — the order the schema must preserve. */
export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

/** Documented on the interface itself. */
export interface Endpoint {
  /** Where to connect. */
  url: string;
  /** How long to wait. */
  timeoutMs?: number;
}

/** Base carrying a documented member with no prose of its own downstream. */
export interface Retryable {
  /**
   * How many times to retry before giving up.
   */
  retries: number;
}

/**
 * A class standing for a string in the schema, like `SecretString`.
 *
 * @type string
 */
export class Masked {
  /** Not part of the schema: `@type` replaces the class shape. */
  value: string;
}

/**
 * A class written as a number or a string, like `Duration`.
 *
 * @type number | string
 *
 * Prose after the tag is not part of the type.
 */
export class Span {
  /** Not part of the schema. */
  seconds: number;
}

/**
 * Not a JSON type: the class keeps its object shape.
 *
 * @type Masked
 */
export class Opaque {
  /** Kept. */
  inner: string;
}

/** Parameters covering primitives, defaults, enums and nesting. */
export class BroadParameters extends ServiceParameters implements Retryable {
  /** A plain required string. */
  name: string;
  /** Defaulted, so not required. */
  region: string = "eu-west-1";
  /** Booleans pick up `default: false`. */
  verbose: boolean;
  /** Optional marks it out of `required`. */
  port?: Port;
  /** Declaration order must survive. */
  level: LogLevel = "INFO";
  /** Hoisted into `definitions` and referenced. */
  endpoint: Endpoint;
  /** Arrays of primitives. */
  tags: string[];
  /** An inline object is keyed by its schema path. */
  limits: {
    /** Upper bound. */
    max: number;
  };
  /** A map becomes `additionalProperties`. */
  labels: { [key: string]: string };
  /** Dates are strings with a format. */
  since: Date;
  /** @minimum 1 */
  weight: number;
  // Tags but no prose: the description has to come from `Retryable`.
  /**
   * @default 3
   */
  retries: number;
  /**
   * See {@link Endpoint} for the shape.
   */
  linked: string;
  /**
   * Repeated tags collect into an array.
   * @examples ["a"]
   * @examples ["b"]
   */
  sampled: string;
  /** @deprecated */
  legacy: string;
  /**
   * Server-owned. The lowercase spelling is the one the corpus uses, and it
   * is not a JSON Schema keyword — it arrives through the generic tag path.
   * @readonly
   */
  createdAt: string;
  /**
   * TypeScript parses this payload as a type expression, so 6.x saw an empty
   * tag. The values land in `enum`.
   * @enum ["a", "b"]
   */
  channel: string;
  /**
   * The tag replaces the values of the union.
   * @enum ["gold", "silver"]
   */
  tier: "gold" | "silver" | "bronze";
  /**
   * Not a list of values: ignored.
   * @enum gold
   */
  loose: string;
  /** @enum 1 */
  scalarEnum: string;
  /** A string or a class documented as a string. */
  masked: string | Masked;
  /** The class first: the property keeps its own description. */
  maskedFirst?: Masked | string;
  /** Distinct types still make a type array. */
  maskedOrNumber?: Masked | number;
  /** A class tagged with several JSON types. */
  span?: Span;
  /** A class tagged with something else than JSON types. */
  opaque?: Opaque;
  /** Never reaches the schema. */
  private secret: string;
  /** Nor does a method. */
  helper(): void {}
}

/** Service whose parameters are named on the extends clause. */
export class BroadService extends Service<BroadParameters> {}

/** Parameters holding a type the converter has no representation for. */
export class ExoticParameters extends ServiceParameters {
  /** A symbol cannot be JSON, but it is dropped rather than fatal. */
  marker: symbol;
  /** An index type has no JSON Schema form. */
  picked: keyof BroadParameters;
}

/** Service used to prove the converter refuses rather than guesses. */
export class ExoticService extends Service<ExoticParameters> {}

/**
 * A class standing for an encrypted string, like `SecretString`.
 *
 * @type string
 * @secret
 */
export class Hidden {
  /** Not part of the schema. */
  value: string;
}

/** A third-party connection settings object, like `pg.ClientConfig`. */
export interface Connection {
  /** Not a secret. */
  host: string;
  /** A secret, listed on the property. */
  password?: string;
  /** A secret, listed on the property. */
  connectionString?: string;
}

/** Parameters holding secrets, by type or by `@secret` tag. */
export class SecretParameters extends ServiceParameters {
  /** The usual secret field. */
  apiKey: string | Hidden;
  /** The class alone. */
  token?: Hidden;
  /** The class first. */
  tokenFirst?: Hidden | string;
  /** Mixed with other types. */
  pin?: Hidden | number;
  /** A list of secrets. */
  keys?: (string | Hidden)[];
  /** Nested in an inline object. */
  credentials?: {
    /** Not a secret. */
    accessKeyId: string;
    /** A secret. */
    secretAccessKey: string | Hidden;
  };
  /**
   * Any client options, all secret.
   * @secret - prose only
   */
  client?: any;
  /**
   * A structure the author does not own.
   * @secret password,connectionString - prose after the names is ignored
   */
  server?: Connection;
  /**
   * A file path or an inline configuration.
   * @secret
   */
  config?: string | Connection;
  /** A plain string. */
  name?: string;
  /** Tagged `@type string` but not `@secret`. */
  masked?: string | Masked;
}

/** Service whose parameters hold secrets. */
export class SecretService extends Service<SecretParameters> {}
