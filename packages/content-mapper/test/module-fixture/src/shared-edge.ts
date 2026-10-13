/// <reference types="node" />
import { Shared } from "./decorators.js";
import fixtureDefault from "./default.js";
import { formatDate as fmt } from "./helpers.js";
import * as helpers from "./helpers.js";

namespace Units {
  export const day = 86_400_000;
}
import Day = Units.day;

// Not a model: only read by buildModelShared directly, for the purity rules
// not exercised by shared.ts.
export class Edges {
  constructor(public readonly id: string) {}

  get full(): string {
    return this.id;
  }

  set only(_value: number) {}

  /**
   * Default, renamed and namespace imports, a qualified type name, an inferred return type
   * @param money - an amount
   */
  @Shared()
  imports(money: helpers.Money) {
    return [fixtureDefault(), fmt(new Date()), helpers.formatDate(new Date()), money.amount];
  }

  @Shared()
  members(@Shared() factor: number): number {
    this.only = factor;
    return this.full.length + this.constructor.name.length;
  }

  @Shared()
  locals(items: number[]): number | undefined {
    type Local = number;
    let found: Local | undefined = undefined;
    outer: for (const item of items) {
      if (item < 0) continue outer;
      found = item;
      break outer;
    }
    return found;
  }

  @Shared()
  impure(): number {
    // @ts-expect-error -- not declared on the model
    return this.id.length + this.missing + Day + FIXTURE_GLOBAL + process.pid;
  }
}

export class Indexed {
  [key: string]: unknown;

  @Shared()
  dynamic(): unknown {
    return this.anything;
  }
}

export default class {
  @Shared()
  anonymous(): number {
    return 1;
  }
}
