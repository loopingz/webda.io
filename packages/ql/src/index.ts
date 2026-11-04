import { registerWebdaPackage } from "@webda/utils";
export * from "./query.js";
export * from "./webdaql-string.js";
export * from "./bind.js";
export * from "./aggregation.js";
export * from "./filter.js";
export * from "./completion.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/ql", import.meta.url);
