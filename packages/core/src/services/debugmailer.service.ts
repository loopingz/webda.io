import { ServiceParameters } from "./serviceparameters.js";
import { AbstractMailer } from "./mailer.service.js";

/** Configuration of the template renderer used by the debug mailer. */
export class DebugMailerParameters extends ServiceParameters {
  /** TemplateService bean to use, defaulting to TemplateService. */
  templateService?: string;
}

/**
 * Fake Service to help debug mail expedition
 * @WebdaModda
 */
export class DebugMailer extends AbstractMailer<DebugMailerParameters> {
  sent: any[] = [];

  /**
   * Create the default configuration
   * @param params - the service parameters
   * @returns the result
   */
  static createConfiguration(params: any): any {
    return new DebugMailerParameters().load(params);
  }

  /**
   * Return parameters unchanged
   * @param params - the service parameters
   * @returns the result
   */
  static filterParameters(params: any): any {
    return params;
  }

  /**
   * Fakely send a message saving it to memory to test later on
   *
   * @param options - the options
   * @param _callback - the callback function
   */
  async send(options: any, _callback = undefined): Promise<void> {
    if (options.template) {
      if (!options.replacements) {
        options.replacements = {};
      }
      options.replacements.now = new Date();
      const templateService = this.getTemplateService();
      if (templateService && (await templateService.has(options.template))) {
        const result = await templateService.renderAll(options.template, options.replacements, {
          locale: options.locale
        });
        if (result.subject) {
          options.subject = result.subject;
        }
        if (result.html) {
          options.html = result.html;
        }
        if (result.text) {
          options.text = result.text;
        }
      }
    }
    this.log("DEBUG", "Send a fake email", options);
    this.sent.push(options);
  }

  /**
   * Just send a new Error exception
   */
  error() {
    throw new Error("FakeError");
  }

  /**
   * Check if the email template exists
   *
   * @param _name - the name to use
   * @returns true if the condition is met
   */
  async hasNotification(_name: string): Promise<boolean> {
    // Load template
    return true;
  }

  /**
   * Just send a new Error exception as async
   */
  async errorAsync() {
    throw new Error("FakeError");
  }

  /**
   * Empty async method
   */
  async async(): Promise<void> {
    // Empty on purpose
  }
}
