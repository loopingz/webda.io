import { Action, Operation } from "./decorators.js";

// Not a model (nothing here extends @webda/models): only read by
// buildModelActions directly, to check the `@Action({ name })` option.
export class Jobs {
  // Exposed as `status` while the method keeps a non-conflicting name
  @Action({ name: "status", description: "Report" })
  statusAction() {}

  @Operation()
  run() {}

  // A name equal to the method name records no handler
  @Action({ name: "same" })
  same() {}

  @Action({ name: "lookup" })
  static find() {}
}

const dynamicName = "dynamic";

/**
 * A decorator used without a call
 * @param _args - ignored
 * @returns nothing
 */
function Bare(..._args: any[]): any {}

/**
 * Another decorator taking a `name` option
 * @returns the decorator
 */
function Other(..._args: any[]): any {
  return () => {};
}

// Every shape the `name` option reader has to cope with
export class ActionNames {
  @Action({ name: "named" })
  named() {}

  @Operation({ name: "viaOperation" })
  operation() {}

  @Action()
  noArgument() {}

  @Action("text")
  notAnObject() {}

  @Action({ description: "no name" })
  noName() {}

  @Action({ name: dynamicName })
  computedName() {}

  @Action({ name: "" })
  emptyName() {}

  @Other({ name: "ignored" })
  @Bare
  otherDecorators() {}

  undecorated() {}

  async modifierOnly() {}
}
