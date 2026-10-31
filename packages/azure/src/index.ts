import { registerWebdaPackage } from "@webda/utils";
export * from "./services/azure-parameters.js";
export * from "./services/contributors.js";
export * from "./services/keyvault.service.js";
export * from "./services/monitorlogger.service.js";
export * from "./services/servicebus.service.js";
export * from "./services/blob.service.js";
export * from "./services/cosmos.service.js";
export * from "./services/functionserver.service.js";
export * from "./auth.js";
export * from "./template.js";
export * from "./deployers/arm.service.js";
export * from "./deployers/containerapps.service.js";
export * from "./deployers/functionspackager.service.js";
export * from "./deployers/functions.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/azure", import.meta.url);
