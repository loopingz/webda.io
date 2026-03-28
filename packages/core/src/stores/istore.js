/*
export type CRUDHelper<T extends object> = {
  [K in keyof Omit<StoreHelper<T>, "create" | "query" | "get" | "update">]: OmitFirstArg<StoreHelper<T>[K]>;
} & {
  setAttribute<K extends Attributes<T>, L extends Attributes<T>>(
    property: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  incrementAttribute<K extends FilterAttributes<T, number>, L extends Attributes<T>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  upsert(data: T): Promise<T>;
  create(data: T, withSave?: boolean): Promise<T>;
};

export type CRUDModel<T extends object = object> = Omit<CRUDHelper<T>, "upsert" | "create" | "exists" | "update"> &
  T & { save(full?: boolean | keyof T, ...fields: (keyof T)[]): Promise<T> };

*/
//# sourceMappingURL=istore.js.map