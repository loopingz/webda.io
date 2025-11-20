import { key as importedKey, Keys } from "./module.js";
const key = "localKey";

enum LocalKeys {
  Key = "localEnumKey"
}

export interface MyObject {
  [key]?: string;
  [LocalKeys.Key]?: string;
  [importedKey]?: string;
  [Keys.Key]?: string;
}
