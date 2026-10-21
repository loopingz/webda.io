import {
  AbstractMailer,
  SecretString,
  ServiceParameters,
  useDynamicService,
  type MailerSendOptions
} from "@webda/core";
import type { ServicePartialParameters } from "@webda/core";
import { TemplateRenderer, type TemplateService } from "@webda/templates";
import { convert } from "html-to-text";
import juice from "juice";
import * as nodemailer from "nodemailer";
import { resolve } from "path";

/**
 * Parameters for the Mailer service configuration
 *
 * Configures the email transport and where templates are rendered from
 *
 * @secret auth.pass,SES.credentials - nodemailer transport options to encrypt with `webda config encrypt`
 */
export class MailerParameters extends ServiceParameters {
  /**
   * Folder containing the mailer templates
   *
   * When set (or when `templatesEngine` is set), the mailer renders with its own renderer on this folder,
   * even if a TemplateService is configured. Left unset, the `templateService` is used if it exists,
   * otherwise `./templates`
   */
  templates?: string;
  /**
   * Template engine to use with the mailer own renderer, `mustache` when unset
   *
   * Setting it makes the mailer use its own renderer, like `templates`
   */
  templatesEngine?: string;
  /**
   * Name of the TemplateService to render with when neither `templates` nor `templatesEngine` are set
   *
   * @default "TemplateService"
   */
  templateService?: string;
  /**
   * Define the default sender
   */
  sender: string;
  /**
   * Rendering options
   */
  emailTemplateOptions?: {
    /**
     * juice `juiceResources` options used to inline the CSS of the html part
     *
     * `webResources.relativeTo` defaults to the templates folder
     *
     * @see https://github.com/Automattic/juice
     */
    juiceResources?: any;
  };
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
   * `templates` and `templatesEngine` stay undefined when not configured: being set is what makes the
   * mailer use its own renderer instead of the TemplateService
   *
   * @param params - Raw parameters to load
   * @returns this instance with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.templateService ??= "TemplateService";
    this.emailTemplateOptions ??= {};
    return this;
  }
}

/**
 * Error code of the @webda/templates TemplateNotFoundError
 */
const TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND";

/**
 * What the mailer needs from a template renderer
 */
export type MailerTemplateRenderer = Pick<TemplateRenderer, "has" | "renderAll">;

/**
 * Resolved templates source of the mailer
 */
export interface MailerTemplates {
  /**
   * Renderer to use
   */
  renderer: MailerTemplateRenderer;
  /**
   * Folder used as default juice `webResources.relativeTo`
   */
  folder: string;
}

/**
 * Render `html` with juice, inlining its CSS
 * @param html - the html to inline
 * @param options - juice `juiceResources` options
 * @returns the inlined html
 */
function juiceResources(html: string, options: any): Promise<string> {
  return new Promise((ok, ko) => {
    juice.juiceResources(html, options, function onJuiced(err, result) {
      if (err) {
        ko(err);
        return;
      }
      ok(result);
    });
  });
}

/**
 * A Mailer based on the nodemailer module, rendering its templates with `@webda/templates`
 *
 * Its parameters are the nodemailer `createTransport` options ( https://nodemailer.com/ )
 *
 * Templates are rendered, in this order, by:
 * 1. a private renderer on `templates` if `templates` or `templatesEngine` is set on the mailer
 * 2. the `templateService` service (default `TemplateService`) if it exists
 * 3. a private renderer on `./templates`
 *
 * @category CoreServices
 * @WebdaModda
 */
export class Mailer<T extends MailerParameters = MailerParameters> extends AbstractMailer<T> {
  /** Nodemailer transport instance used to send emails */
  _transporter: any;
  /** Resolved templates source, lazily computed */
  protected templatesSource?: MailerTemplates;

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
      <nodemailer.TransportOptions>SecretString.unwrap({ ...this.parameters })
    );
    return this;
  }

  /**
   * Resolve the renderer used for the templates
   *
   * @returns the renderer and the folder used as juice `relativeTo`
   */
  protected getTemplates(): MailerTemplates {
    if (this.templatesSource) {
      return this.templatesSource;
    }
    const { templates, templatesEngine, templateService } = this.parameters;
    if (templates === undefined && templatesEngine === undefined) {
      const service = useDynamicService<TemplateService | undefined>(templateService!);
      if (service) {
        this.templatesSource = {
          renderer: service,
          folder: service.getParameters().folders?.[0] ?? "./templates"
        };
        return this.templatesSource;
      }
    }
    const folder = templates ?? "./templates";
    this.templatesSource = {
      renderer: new TemplateRenderer({ folders: [folder], engine: templatesEngine ?? "mustache" }),
      folder
    };
    return this.templatesSource;
  }

  /**
   * Check if an email template exists
   *
   * @param name - Template name to check
   * @param locale - Locale to look for
   * @returns true if the template exists, single or multi-part
   */
  async hasNotification(name: string, locale?: string): Promise<boolean> {
    return this.getTemplates().renderer.has(name, { locale });
  }

  /**
   * Render a template into the subject, html and text of the email
   *
   * @param options - the send options, updated in place
   * @throws Error "Unknown mail template" if the template is not a multi-part template
   */
  protected async render(options: MailerSendOptions): Promise<void> {
    const { renderer, folder } = this.getTemplates();
    let result: Record<string, string>;
    try {
      result = await renderer.renderAll(
        options.template!,
        { ...options.replacements, now: new Date() },
        { locale: options.locale }
      );
    } catch (err: any) {
      // Compared by code: @webda/templates can be loaded twice (lib and src)
      if (err?.code === TEMPLATE_NOT_FOUND) {
        this.log("WARN", "No template found for", options.template);
        throw new Error("Unknown mail template");
      }
      throw err;
    }
    if (result.subject) {
      options.subject = result.subject.trim();
    }
    if (result.html) {
      const juiceOptions = this.parameters.emailTemplateOptions?.juiceResources ?? {};
      options.html = await juiceResources(result.html, {
        ...juiceOptions,
        webResources: {
          relativeTo: resolve(folder),
          images: false,
          ...juiceOptions.webResources
        }
      });
    }
    if (result.text) {
      options.text = result.text;
    } else if (options.html && result.html) {
      options.text = convert(options.html, { selectors: [{ selector: "img", format: "skip" }] });
    }
  }

  /**
   * Send an email using the configured nodemailer transport
   *
   * If a template is specified in options, it is rendered with the provided replacements
   * (plus a `now` Date) and the `locale` before sending. Falls back to `parameters.sender`
   * if no `from` is provided.
   *
   * @param options - Mail options including optional template and replacements
   * @param callback - Optional callback passed to nodemailer's sendMail
   * @returns Promise resolving with the nodemailer send result
   * @throws Error if no transporter is configured or the template is unknown
   */
  async send(options: MailerSendOptions & nodemailer.SendMailOptions, callback = undefined): Promise<any> {
    if (this._transporter === undefined) {
      this.log("ERROR", "Cannot send email as no transporter is defined");
      return Promise.reject("Cannot send email as no transporter is defined");
    }
    if (!options.from) {
      options.from = this.parameters.sender;
    }
    if (options.template) {
      await this.render(options);
    }
    return this._transporter.sendMail(options, callback);
  }
}
