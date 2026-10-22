import { registerWebdaPackage } from "@webda/utils";
export * from "./pubsub.service.js";
export * from "./queue.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/amqp", import.meta.url);
