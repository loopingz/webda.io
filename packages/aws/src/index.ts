import { registerWebdaPackage } from "@webda/utils";
export * from "./services/index.js";
export * from "./deployers/index.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/aws", import.meta.url);
