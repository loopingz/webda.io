import type { Service } from "./service.js";

/**
 * Transport of text messages (SMS): implemented by provider services such as `DebugSmsSender` or
 * `SnsSmsSender` (`@webda/aws`), used by the SMS second factor
 */
export interface SmsSender extends Service {
  /**
   * Send a text message
   * @param to - recipient phone number in E.164 format, e.g. "+15550100089"
   * @param message - message body
   */
  send(to: string, message: string): Promise<void>;
}
