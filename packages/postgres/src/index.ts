import { registerWebdaPackage } from "@webda/utils";
export * from "./dialect.js";
export * from "./postgrespubsub.service.js";
export * from "./postgresqueue.service.js";
export * from "./postgresstore.service.js";
export * from "./sqlstore.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/postgres", import.meta.url);
