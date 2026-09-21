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
