import { NotificationService } from "./notificationservice.service.js";
import { Service } from "./service.js";
import { Counter } from "../metrics/metrics.js";
import type { User } from "../models/user.model.js";
import type { Ident } from "../models/ident.model.js";
import { ServiceParameters } from "./serviceparameters.js";

/**
 * Transport-agnostic options to send an email
 *
 * Mailer implementations can accept additional transport specific options
 * through the index signature
 */
export interface MailerSendOptions {
  /**
   * Sender of the email
   *
   * Implementations usually default it to their configured sender
   */
  from?: string | string[];
  /**
   * Recipients of the email
   */
  to?: string | string[];
  /**
   * Carbon copy recipients
   */
  cc?: string | string[];
  /**
   * Blind carbon copy recipients
   */
  bcc?: string | string[];
  /**
   * Address to reply to
   */
  replyTo?: string | string[];
  /**
   * Subject of the email
   */
  subject?: string;
  /**
   * HTML body of the email
   */
  html?: string;
  /**
   * Text body of the email
   */
  text?: string;
  /**
   * Attachments, their format depends on the implementation
   */
  attachments?: any[];
  /**
   * Template to use
   */
  template?: string;
  /**
   * Replacements for the template
   */
  replacements?: Record<string, any>;
  /**
   * Locale to render the template with
   */
  locale?: string;
  /**
   * Transport specific options
   */
  [key: string]: any;
}

/**
 * Represent a mailer service
 */
export interface MailerService extends NotificationService {
  /**
   * Send an email
   *
   * @param options - Options of the email to send
   * @param callback - Callback for implementations that support it
   * @returns Promise resolving when the email is sent
   */
  send(options: MailerSendOptions, callback?: () => void): Promise<any>;
}

/**
 * Abstract base class for mailer implementations
 *
 * Provides metrics tracking (sent/errors counters) and notification handling.
 * Subclasses must implement {@link send} and {@link hasNotification}.
 *
 * @typeParam T - Service parameters type
 */
export abstract class AbstractMailer<T extends ServiceParameters = ServiceParameters>
  extends Service<T>
  implements MailerService
{
  /**
   * Mailer metrics for tracking sent emails and errors
   */
  declare metrics: {
    sent: Counter;
    errors: Counter;
  };

  /**
   * @override
   */
  initMetrics() {
    super.initMetrics();
    this.metrics.sent = this.getMetric(Counter, {
      name: "mailer_sent",
      help: "Number of emails sent"
    });
    this.metrics.errors ??= this.getMetric(Counter, {
      name: "mailer_errors",
      help: "Number of emails in error"
    });
  }

  /**
   * @inheritdoc
   */
  abstract send(options: MailerSendOptions, callback?: () => void): Promise<any>;
  /**
   * @inheritdoc
   */
  abstract hasNotification(notification: string): Promise<boolean>;

  /**
   * Check if notifications can be delivered to a user via email
   *
   * @param user - User or Ident to check for email availability
   * @returns true if the user has an email address
   */
  async handleNotificationFor(user: User | Ident): Promise<boolean> {
    return user.getEmail() !== undefined;
  }

  /**
   * Send a notification email to a user
   *
   * Resolves the user's email, increments the sent metric, and delegates
   * to {@link send}. Increments the error metric on failure.
   *
   * @param user - User or Ident to send the notification to
   * @param notification - Template name for the notification
   * @param replacements - Template variables for rendering
   * @throws Error if the user has no valid email address
   * @override
   */
  async sendNotification(user: User | Ident, notification: string, replacements: any): Promise<void> {
    const email = user.getEmail();
    if (!email) {
      throw new Error(`Cannot find a valid email for ${user}`);
    }
    this.metrics.sent.inc();
    try {
      await this.send({
        template: notification,
        replacements: {
          ...replacements
        },
        to: email
      });
    } catch (err) {
      this.metrics.errors.inc();
      throw err;
    }
  }
}
