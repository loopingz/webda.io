import Email from "email-templates";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import * as path from "path";
import { AbstractMailer, type MailerSendOptions } from "@webda/core";
import { Service } from "./service.js";
import { SecretString } from "./cryptoservice.service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { ServicePartialParameters } from "./iservice.js";

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
   *
   * Credentials inside can be encrypted with `webda config encrypt`
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
