import { registerWebdaPackage } from "@webda/utils";
export * from "./cli-bin.js";
export * from "./compiler.js";
export * from "./configuration.js";
export * from "./definition.js";
export * from "./operations.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/compiler", import.meta.url);
