// Stand-in for @webda/models: discovery keys models off the package name, relations off the written type name.
export const WEBDA_PRIMARY_KEY: unique symbol = Symbol("Primary key");
export class Model {}
export class UuidModel extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  uuid: string;
}
export class ModelParent<T> {
  target?: T;
}
export class ModelLink<T> {
  target?: T;
}
export class ModelLinksSimpleArray<T> {
  target?: T;
}
export class ModelLinksArray<T, K> {
  target?: T;
  attributes?: K;
}
export class ModelRelated<T, L, K extends string = ""> {
  target?: T;
  linker?: L;
  attribute?: K;
}
export type BelongTo<T> = ModelParent<T>;
export type RelateTo<T> = ModelLink<T>;
export type ManyToOne<T> = ModelLink<T>;
export type OneToOne<T> = ModelLink<T>;
export type OneToMany<T, L, K extends string> = ModelRelated<T, L, K>;
export type ManyToMany<T, K extends object = object> = ModelLinksArray<T, K>;
export type Contains<T> = ManyToMany<T>;

export interface Storable {}
export type ModelLinkData<K extends object = object> = { model: string; key: string | number | Record<string, string | number> } & K;
export class ModelLinksAny<K extends object = object, T extends Storable = Storable> {
  constructor(targets: readonly (new () => T)[] = []) {}
  /** @WebdaAutoSetter */
  set(values: readonly ModelLinkData<K>[] = []): void {}
  toJSON(): ModelLinkData<K>[] { return []; }
}
