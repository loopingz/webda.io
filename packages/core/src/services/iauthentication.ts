import { Context } from "../contexts/icontext";
import { Service } from "./service";

/**
 * Authentication service interface
 */
export interface IAuthenticationService extends Service {
  onIdentLogin(ctx: Context, provider: string, identId: string, profile: any, tokens?: any): Promise<void>;
}
