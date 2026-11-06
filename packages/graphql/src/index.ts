import { registerWebdaPackage } from "@webda/utils";
export * from "./graphql.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/graphql", import.meta.url);
