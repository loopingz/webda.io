// Stand-in for @webda/models: discovery keys models off the package name, and
// buildModelEvents keys `Events` off the `WEBDA_EVENTS` symbol declared here.
export const WEBDA_EVENTS: unique symbol = Symbol("Events");

export type ModelEvents<T> = {
  Created: { object: T };
  Deleted: { object: T };
};

export class Model {
  // Optional, as in @webda/models: under `strict` the member's type is `ModelEvents<this> | undefined`
  [WEBDA_EVENTS]?: ModelEvents<this>;
}
