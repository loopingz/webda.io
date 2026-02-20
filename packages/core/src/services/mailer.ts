import Email from "email-templates";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import * as path from "path";
import { NotificationService } from "./notificationservice.js";
import { Service } from "./service.js";
import { Counter } from "../metrics/metrics.js";
import type { User } from "../models/user.js";
import type { Ident } from "../models/ident.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { ServicePartialParameters } from "../internal/iapplication.js";

/**
 * Interface for an email template that can render subject, html and text
 */
interface IEmailTemplate {
  /**
   * Render all template variants (subject, html, text) for the given file
   *
   * @param file - Template file name to render
   * @param options - Template variables for rendering
   * @returns Rendered result with subject, html and text properties
   */
  renderAll(file: string, options: any);
}

/**
 * Map of template names to their email template instances
 */
interface TemplatesMap {
  [key: string]: IEmailTemplate;
}

/**
 * Represent a mailer service
 */
export interface MailerService extends NotificationService {
  /**
   * Send an email
   *
   * @param options - Options to pass to the sendMail option of the nodemailer module
   * @param callback - Callback to pass to sendMail
   * @returns Promise resolving when the email is sent
   */
  send(options: MailerSendOptions, callback: () => void): Promise<any>;
}

/**
 * Options for sending an email, extending nodemailer's SendMailOptions
 * with template support
 */
interface MailerSendOptions extends nodemailer.SendMailOptions {
  /**
   * Sender of the email
   *
   * @default parameters.sender
   */
  from?: nodemailer.SendMailOptions["from"];
  /**
   * Template to use
   */
  template?: string;
  /**
   * Replacements for the template
   */
  replacements?: Record<string, any>;
}

/**
 * Parameters for the Mailer service configuration
 *
 * Configures the email transport, templates directory and template engine
 */
export class MailerParameters extends ServiceParameters {
  /**
   * Specify which folder contains templates
   *
   * @default "templates"
   */
  templates?: string;
  /**
   * Template engine to use
   *
   * @default "mustache"
   */
  templatesEngine?: string;
  /**
   * Define the default sender
   */
  sender: string;
  /**
   * @see https://www.npmjs.com/package/email-templates
   */
  emailTemplateOptions?: any;
  /**
   * Define the type of transport to use
   */
  transport?: string;
  /**
   * SES AWS Bean if transport === "ses"
   */
  SES?: any;

  /**
   * Load and apply defaults to the mailer parameters
   *
   * Sets default templates directory to "./templates/", engine to "mustache",
   * and configures juice resource options for CSS inlining
   *
   * @param params - Raw parameters to load
   * @returns this instance with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.templates ??= "./templates";
    if (!this.templates.endsWith("/")) {
      this.templates += "/";
    }
    this.templatesEngine ??= "mustache";
    this.emailTemplateOptions ??= {};
    this.emailTemplateOptions.juiceResources ??= {};
    this.emailTemplateOptions.juiceResources.webResources ??= {};
    this.emailTemplateOptions.juiceResources.webResources.relativeTo ??= path.resolve(this.templates);
    return this;
  }
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
  abstract hasNotification(notification: string);

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

/**
 * A basic Mailer based on the nodemailer module
 *
 * Inside config it is the nodemailer module option for the method createTransport ( https://nodemailer.com/ )
 *
 * Only ses transport module is installed by default
 *
 * Parameters
 * config: { ... }
 * @category CoreServices
 * @WebdaModda
 */
class Mailer<T extends MailerParameters = MailerParameters> extends AbstractMailer<T> {
  /** Nodemailer transport instance used to send emails */
  _transporter: any;
  /** Cache of loaded email template instances by name */
  _templates: TemplatesMap = {};

  /**
   * Load and instantiate mailer parameters with defaults
   *
   * @param params - Raw service parameters
   * @returns Loaded MailerParameters instance
   * @ignore
   */
  loadParameters(params: ServicePartialParameters<T>): T {
    return <T>new MailerParameters().load(params);
  }

  /**
   * Initialize the nodemailer transport from the service parameters
   *
   * @returns this instance after transport creation
   * @override
   */
  async init(): Promise<this> {
    this._transporter = nodemailer.createTransport(this.parameters);
    return this;
  }

  /**
   * Get or create a cached email template instance by name
   *
   * Lazily creates and caches an Email template using the configured
   * templates directory and engine. Logs a warning if the template does not exist.
   *
   * @param name - Template name (must correspond to a directory in the templates folder)
   * @returns The email template instance, or undefined if the template does not exist
   */
  _getTemplate(name: string) {
    if (!this._templates[name]) {
      if (!this.hasNotification(name)) {
        this.log("WARN", "No template found for", name);
        return;
      }
      this._templates[name] = new Email({
        ...this.parameters.emailTemplateOptions,
        views: {
          root: this.parameters.templates,
          options: {
            extension: this.parameters.templatesEngine
          }
        }
      });
    }
    return this._templates[name];
  }

  /**
   * Check if an email template exists on the filesystem
   *
   * @param name - Template name to check
   * @returns true if the template directory exists
   */
  hasNotification(name: string): boolean {
    // Load template
    return fs.existsSync(this.parameters.templates + name);
  }

  /**
   * Send an email using the configured nodemailer transport
   *
   * If a template is specified in options, it will be rendered with the
   * provided replacements before sending. A `now` Date variable is
   * automatically added to replacements. Falls back to `parameters.sender`
   * if no `from` is provided.
   *
   * @param options - Mail options including optional template and replacements
   * @param callback - Optional callback passed to nodemailer's sendMail
   * @returns Promise resolving with the nodemailer send result
   * @throws Error if no transporter is configured or the template is unknown
   */
  async send(options: MailerSendOptions, callback = undefined): Promise<any> {
    if (this._transporter === undefined) {
      this.log("ERROR", "Cannot send email as no transporter is defined");
      return Promise.reject("Cannot send email as no transporter is defined");
    }
    if (!options.from) {
      options.from = this.parameters.sender;
    }
    if (options.template) {
      if (!options.replacements) {
        options.replacements = {};
      }
      options.replacements.now = new Date();
      const template = this._getTemplate(options.template);
      if (template) {
        const result = await template.renderAll(options.template, options.replacements);
        if (result.subject) {
          options.subject = result.subject;
        }
        if (result.html) {
          options.html = result.html;
        }
        if (result.text) {
          options.text = result.text;
        }
      } else {
        throw Error("Unknown mail template");
      }
    }
    return this._transporter.sendMail(options, callback);
  }
}

export { Mailer, type TemplatesMap, type IEmailTemplate };
