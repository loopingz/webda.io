import { Actionable, WEBDA_ACTIONS } from "../src";
import { Model, ModelEvents } from "../src/model";
import { ModelLinksSimpleArray } from "../src/relations";
import { PK, SelfDTOed, SelfJSONed, Storable, WEBDA_EVENTS, WEBDA_PLURAL, WEBDA_PRIMARY_KEY } from "../src/storable";

/** Container image identified by its digest, with linked vulnerabilities. */
export class Container extends Model {
  [WEBDA_PRIMARY_KEY] = ["digest"] as const;
  [WEBDA_EVENTS]: ModelEvents<this> & { Test: { digest: string } };

  digest: string;
  vulnerabilities: ModelLinksSimpleArray<Vulnerability>;
  /**
   * Serialize the container to its JSON representation.
   * @returns the JSON representation
   */
  toJSON() {
    return this as SelfJSONed<this>;
  }
}

/**
 * Define some additional customer event
 */
export type VulnerabilityEvents<T> = {
  discover: (info: { vulnerability: T }) => void;
} & ModelEvents<T>;
/**
 * Example of a model that implements the interface
 * instead of expanding model
 */
export class Vulnerability implements Storable<Vulnerability, "id">, Actionable {
  [WEBDA_EVENTS]: VulnerabilityEvents<this>;
  [WEBDA_PRIMARY_KEY]: readonly "id"[] = ["id"] as const;
  [WEBDA_ACTIONS]: {
    update: object;
  };
  [WEBDA_PLURAL] = "Vulnerabilities";
  id: string;

  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   * @returns the primary key value
   */
  getPrimaryKey(): PK<Vulnerability, Vulnerability[typeof WEBDA_PRIMARY_KEY][number]> {
    return this.id;
  }

  /**
   * Serialize to JSON representation.
   * @returns the JSON representation
   */
  toJSON() {
    return this as SelfJSONed<this>;
  }

  /**
   * Convert to a data-transfer object.
   * @returns the DTO representation
   */
  toDTO() {
    return this as SelfDTOed<this>;
  }

  /**
   * Restore state from a data-transfer object.
   * @param dto - the data transfer object
   */
  fromDTO(dto: SelfDTOed<this>): void {
    Object.assign(this, dto);
  }
}

const t = new Vulnerability().getPrimaryKey();
