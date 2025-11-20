type PrimaryKeyAttributes<T> = T extends Root ? T["primaryKey"][number] : never;
abstract class Root {
  abstract primaryKey: readonly string[];
  attributes!: PrimaryKeyAttributes<this>;
}

export class Demo extends Root {
  primaryKey = ["id"] as const;
  id!: string;
}

export class Demo2 extends Root {
  primaryKey = ["key1", "key2"] as const;
  key1!: string;
  key2!: string;
}

// @ts-ignore: suppress deep instantiation check for demo assignment
new Demo2().attributes = "key1";
// @ts-ignore: suppress deep instantiation check for demo assignment
new Demo().attributes = "id";
