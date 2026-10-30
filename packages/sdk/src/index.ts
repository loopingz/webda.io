import { registerWebdaPackage } from "@webda/utils";
export * from "./manifest.js";
export * from "./generate/index.js";
export * from "./sdkgenerator.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/sdk", import.meta.url);
