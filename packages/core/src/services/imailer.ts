import { Context } from "../contexts/icontext.js";
import { Service } from "./service.js";

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
