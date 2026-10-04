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
