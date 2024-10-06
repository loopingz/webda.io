import { Context } from "../utils/context";
import { Service } from "./service";

/**
 * Mailer interface
 */
export interface IMailer extends Service {
  send(options: {
    to: string;
    locale: string;
    template: string;
    replacements: {
      context: Context;
      [key: string]: any;
    };
  }): Promise<any>;
}
