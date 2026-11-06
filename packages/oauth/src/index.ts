import { registerWebdaPackage } from "@webda/utils";
export * from "./parameters.js";
export * from "./errors.js";
export * from "./clients.js";
export * from "./devicecode.js";
export * from "./models.model.js";
export * from "./pending.js";
export * from "./oauthserver.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/oauth", import.meta.url);
