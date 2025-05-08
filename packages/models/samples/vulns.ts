import { ActionsEnum } from "../src/actionable";
import { Exposable } from "../src/exposable";
import { Model, ModelEvents } from "../src/model";
import { ModelLinksArray } from "../src/relations";
import { PK, Storable } from "../src/storable";

export class Container extends Model {
  PrimaryKey = ["digest"] as const;
  declare Events: ModelEvents<this> & { Test: { digest: string } };

  digest: string;
  vulnerabilities: ModelLinksArray<Vulnerability, "digest">;
  toJSON() {
    return this;
  }
}

export class Vulnerability implements Storable<Vulnerability, "id"> {
  __dirty?: Set<string> | undefined;
  Events: {};
  id: string;
  public PrimaryKey: readonly "id"[] = ["id"] as const;
  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   */
  getPrimaryKey(): PK<Vulnerability, Vulnerability["PrimaryKey"][number]> {
    return this.id;
  }

  toJSON() {
    return this;
  }
}

const t = new Vulnerability().getPrimaryKey();
