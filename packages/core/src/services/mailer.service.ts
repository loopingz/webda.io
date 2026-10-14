import * as nodemailer from "nodemailer";
import * as path from "path";
import juice from "juice";
import { NotificationService } from "./notificationservice.service.js";
import { Inject, Service } from "./service.js";
import { SecretString } from "./cryptoservice.service.js";
import { Counter } from "../metrics/metrics.js";
import type { User } from "../models/user.model.js";
import type { Ident } from "../models/ident.model.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { ServicePartialParameters } from "./iservice.js";
import { TemplateService } from "./template.service.js";
import { useService } from "../core/hooks.js";

/**
 * Interface for an email template that can render subject, html and text
 * @deprecated Handled by TemplateService
 */
interface IEmailTemplate {
  /**
   * Render all template variants (subject, html, text) for the given file
   *
   * @param file - Template file name to render
   * @param options - Template variables for rendering
   * @returns Rendered result with subject, html and text properties
   */
  renderAll(file: string, options: any): Promise<any>;
}

/**
 * Map of template names to their email template instances
 * @deprecated Handled by TemplateService
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
  send(options: MailerSendOptions, callback?: () => void): Promise<any>;
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
  /**
   * Locale for template rendering
   */
  locale?: string;
}

/**
 * Parameters for the Mailer service configuration
 *
 * Configures the email transport, templates directory and template engine
 *
 * @secret auth.pass,SES.credentials - nodemailer transport options to encrypt with `webda config encrypt`
 */
export class MailerParameters extends ServiceParameters {
  /**
   * Specify which folder contains templates
   *
   * @deprecated Configure TemplateService folders instead
   */
  templates?: string;
  /**
   * Template engine to use
   *
   * @deprecated Configure TemplateService engine instead
   */
  templatesEngine?: string;
  /**
   * TemplateService bean to use
   *
   * @default "TemplateService"
   */
  templateService?: string;
  /**
   * Define the default sender
   */
  sender: string;
  /**
   * @see https://www.npmjs.com/package/juice
   */
  emailTemplateOptions?: any;
  /**
   * Define the type of transport to use
   */
  transport?: string;
  /**
   * SES AWS Bean if transport === "ses"
   *
   * Credentials inside can be encrypted with `webda config encrypt`
   */
  SES?: any;

  /**
   * Load and apply defaults to the mailer parameters
   *
   * @param params - Raw parameters to load
   * @returns this instance with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    if (params.templates !== undefined) {
      this.templates = params.templates;
      if (!this.templates.endsWith("/")) {
        this.templates += "/";
      }
    }
    if (params.templatesEngine !== undefined) {
      this.templatesEngine = params.templatesEngine;
    }
    this.templateService ??= "TemplateService";
    this.emailTemplateOptions ??= {};
    this.emailTemplateOptions.juiceResources ??= {};
    this.emailTemplateOptions.juiceResources.webResources ??= {};
    if (this.templates) {
      this.emailTemplateOptions.juiceResources.webResources.relativeTo ??= path.resolve(this.templates);
    }
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
  @Inject("templateService", "TemplateService", true)
  protected templateService!: TemplateService;

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
   * Get the TemplateService instance used by this mailer
   *
   * @returns TemplateService instance
   */
  getTemplateService(): TemplateService {
    if ((this as any)._privateTemplateService) {
      return (this as any)._privateTemplateService;
    }
    if (this.templateService) {
      return this.templateService;
    }
    try {
      return useService("TemplateService");
    } catch {
      return undefined as any;
    }
  }

  /**
   * @inheritdoc
   */
  abstract send(options: MailerSendOptions, callback?: () => void): Promise<any>;

  /**
   * Synchronous check if template exists
   *
   * @param notification - Template name
   * @returns true if template exists
   */
  hasNotificationSync(notification: string): boolean {
    const ts = this.getTemplateService();
    return ts ? ts.hasSync(notification) : false;
  }

  /**
   * Check if an email template exists
   *
   * @param notification - Template name to check
   * @returns true if the template exists
   */
  async hasNotification(notification: string): Promise<boolean> {
    return this.hasNotificationSync(notification);
  }

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
  /** Mailer-private TemplateService when deprecated parameters are used */
  _privateTemplateService?: TemplateService;

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
   * Resolve dependencies and initialize private TemplateService if deprecated parameters are used
   *
   * @override
   */
  resolve(): this {
    super.resolve();
    if (this.parameters.templates !== undefined || this.parameters.templatesEngine !== undefined) {
      this.log("WARN", "Mailer 'templates' and 'templatesEngine' are deprecated, configure TemplateService instead");
      this._privateTemplateService = new TemplateService(`${this.getName()}_TemplateService`, {
        folders: this.parameters.templates ? [this.parameters.templates] : undefined,
        engine: this.parameters.templatesEngine
      } as any);
      this._privateTemplateService.resolve();
    }
    return this;
  }

  /**
   * Initialize the nodemailer transport from the service parameters
   *
   * @returns this instance after transport creation
   * @override
   */
  async init(): Promise<this> {
    if (this._privateTemplateService) {
      await this._privateTemplateService.init();
    }
    // Service parameters carry the nodemailer transport options (SMTP, SES, ...) next to the Mailer settings
    // Encrypted values (auth.pass, SES credentials...) are unwrapped to plain strings for nodemailer
    this._transporter = nodemailer.createTransport(
      <nodemailer.TransportConfig>SecretString.unwrap({ ...this.parameters })
    );
    return this;
  }

  /**
   * Get or create a cached email template instance by name
   *
   * Lazily creates and caches an email template using TemplateService.
   * Logs a warning if the template does not exist.
   *
   * @param name - Template name
   * @returns The email template instance, or undefined if the template does not exist
   */
  _getTemplate(name: string) {
    if (!this._templates[name]) {
      if (!this.hasNotificationSync(name)) {
        this.log("WARN", "No template found for", name);
        return;
      }
      this._templates[name] = {
        renderAll: async (file: string, options: any) => {
          const ts = this.getTemplateService();
          if (!ts) {
            throw new Error("No TemplateService available");
          }
          return ts.renderAll(file, options, { locale: options?.locale });
        }
      };
    }
    return this._templates[name];
  }

  /**
   * Inline CSS in HTML using juice
   *
   * @param html - Raw HTML
   * @returns Inlined HTML
   */
  protected async inlineCss(html: string): Promise<string> {
    try {
      const juiceResources = (juice as any).juiceResources;
      const juiceOptions = this.parameters.emailTemplateOptions?.juiceResources;
      if (juiceOptions && typeof juiceResources === "function") {
        return await new Promise<string>((resolve) => {
          juiceResources(html, juiceOptions, (err: any, inlinedHtml: string) => {
            if (err) return resolve((juice as any)(html));
            resolve(inlinedHtml);
          });
        });
      }
      return (juice as any)(html);
    } catch {
      return html;
    }
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
          options.html = await this.inlineCss(result.html);
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

export { Mailer, type TemplatesMap, type IEmailTemplate, type MailerSendOptions };
