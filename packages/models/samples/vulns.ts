import { Actionable, WEBDA_ACTIONS } from "../src";
import { Model, ModelEvents } from "../src/model";
import { ModelLinksSimpleArray } from "../src/relations";
import { PK, SelfDTOed, SelfJSONed, Storable, WEBDA_EVENTS, WEBDA_PLURAL, WEBDA_PRIMARY_KEY } from "../src/storable";

export class Container extends Model {
  [WEBDA_PRIMARY_KEY] = ["digest"] as const;
  [WEBDA_EVENTS]: ModelEvents<this> & { Test: { digest: string } };

  digest: string;
  vulnerabilities: ModelLinksSimpleArray<Vulnerability>;
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
    update: {};
  };
  [WEBDA_PLURAL] = "Vulnerabilities";
  id: string;

  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   */
  getPrimaryKey(): PK<Vulnerability, Vulnerability[typeof WEBDA_PRIMARY_KEY][number]> {
    return this.id;
  }

  toJSON() {
    return this as SelfJSONed<this>;
  }

  toDTO() {
    return this as SelfDTOed<this>;
  }

  fromDTO(dto: SelfDTOed<this>): void {
    Object.assign(this, dto);
  }
}

const t = new Vulnerability().getPrimaryKey();
