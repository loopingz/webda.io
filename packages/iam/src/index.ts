import { registerWebdaPackage } from "@webda/utils";
export * from "./conditions.js";
export * from "./compiler.js";
export * from "./engine.js";
export * from "./active.js";
export * from "./iampolicy.model.js";
export * from "./iampolicyattachment.model.js";
export * from "./iam.service.js";
export * from "./glob.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/iam", import.meta.url);
