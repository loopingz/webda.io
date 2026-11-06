import { registerWebdaPackage } from "@webda/utils";
export * from "./model.model.js";
export * from "./relations.js";
export * from "./polymorphic.js";
export * from "./types.js";
export * from "./repositories/hooks.js";
export * from "./repositories/repository.js";
export * from "./repositories/abstract.js";
export * from "./repositories/memory.js";
export * from "./repositories/event.js";
export * from "./storable.js";
export * from "./mock.js";
export * from "./aggregation.js";
export * from "./types-resolver.js";
export * from "./repositories/monitoring.js";
export type { FindOptions, FilterOperators, ModelFilter } from "@webda/ql";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/models", import.meta.url);
