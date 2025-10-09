import { Context } from "../contexts/icontext.js";
import { Service } from "./service.js";

/**
 * Authentication service interface
 */
export interface IAuthenticationService extends Service {
  onIdentLogin(ctx: Context, provider: string, identId: string, profile: any, tokens?: any): Promise<void>;
}
