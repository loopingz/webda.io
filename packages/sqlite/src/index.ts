import { registerWebdaPackage } from "@webda/utils";
export * from "./connection.js";
export * from "./dbregistry.js";
export * from "./dialect.js";
export * from "./sqlitestore.service.js";
export * from "./sqlitequeue.service.js";
export * from "./sqlitepubsub.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/sqlite", import.meta.url);
