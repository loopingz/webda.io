import { registerWebdaPackage } from "@webda/utils";
export * from "./services/firestore.service.js";
export * from "./services/pubsub.service.js";
export * from "./services/queue.service.js";
export * from "./services/storage.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/gcp", import.meta.url);
