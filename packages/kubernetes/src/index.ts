import { registerWebdaPackage } from "@webda/utils";
export * from "./cron.js";
export * from "./services/cronexporter.service.js";
export * from "./services/kuberunner.service.js";
export * from "./utils/client.js";
export * from "./utils/informer.js";
export * from "./crd/naming.js";
export * from "./crd/schema.js";
export * from "./services/crdexporter.service.js";
export * from "./stores/resources.js";
export * from "./stores/kubernetesrepository.js";
export * from "./stores/kubernetesstore.service.js";
export * from "./operator/workqueue.js";
export * from "./operator/leader.js";
export * from "./operator/controller.js";
export * from "./operator/operator.service.js";
export * from "./crd/rbac.js";
export * from "./stores/watcher.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/kubernetes", import.meta.url);
