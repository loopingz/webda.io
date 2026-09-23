import { Action, Operation } from "./decorators.js";

/**
 * @WebdaBehavior
 */
export class Audited {
  @Action({ rest: { route: "{id}", method: "GET", other: "x" }, description: "Read", summary: "S" })
  read() {}

  @Operation()
  write() {}

  @Action
  bare() {}

  notAnAction() {}
}

/**
 * @WebdaBehavior Custom/Named
 */
export class Named extends Audited {
  @Action({ rest: { unknown: "x" } })
  own() {}
}

/**
 * @WebdaBehavior
 */
export class WithStatic {
  @Action()
  static forbidden() {}
}

/**
 * @WebdaBehavior
 */
export class WithGlobal {
  @Action({ global: true })
  forbidden() {}
}
