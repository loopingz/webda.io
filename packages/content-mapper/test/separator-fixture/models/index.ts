// Stand-in for @webda/models: discovery keys models off the package name.
export const WEBDA_PRIMARY_KEY: unique symbol = Symbol("Primary key");
export const WEBDA_PRIMARY_KEY_SEPARATOR: unique symbol = Symbol("Primary key separator");
export class Model {}
export class UuidModel extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  uuid: string;
}
