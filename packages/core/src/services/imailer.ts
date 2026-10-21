import { Service } from "./service.js";
import type { MailerSendOptions } from "./abstractmailer.js";

/**
 * Mailer interface
 */
export interface IMailer extends Service {
  /**
   * Send an email
   *
   * @param options - Options of the email to send
   * @returns Promise resolving when the email is sent
   */
  send(options: MailerSendOptions): Promise<any>;
}
