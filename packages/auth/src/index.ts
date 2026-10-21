import { registerWebdaPackage } from "@webda/utils";
export * from "./errors.js";
export * from "./throttle.js";
export * from "./provider.js";
export * from "./authentication.service.js";
export * from "./email/tokens.js";
export * from "./email/emailpassword.service.js";
export * from "./oauth/oauth.service.js";
export * from "./certificate/certificate.service.js";
export * from "./compat/upgrade.js";
export * from "./mfa/secondfactor.service.js";
export * from "./mfa/totp.service.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/auth", import.meta.url);
