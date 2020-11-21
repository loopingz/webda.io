"use strict";
import * as Email from "email-templates";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import { ModdaDefinition } from "../core";
import { Service, ServiceParameters } from "./service";

interface IEmailTemplate {
  renderAll(file: string, options: any);
}

interface TemplatesMap {
  [key: string]: IEmailTemplate;
}

class MailerParameters extends ServiceParameters {
  templates: string;
  templatesEngine: string;
  sender: string;

  constructor(params: any) {
    super(params);
    this.templates = this.templates ?? "templates";
    this.templatesEngine = this.templatesEngine ?? "mustache";
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
 */
class Mailer<T extends MailerParameters = MailerParameters> extends Service<T> {
  _transporter: any;
  _templates: TemplatesMap = {};

  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new MailerParameters(params);
  }

  /**
   * Compute parameters
   */
  computeParameters() {
    try {
      let config: any = {};
      Object.assign(config, this._params);
      if (config.transport === "ses" && !config.SES) {
        let aws = require("aws-sdk");
        aws.config.update(config);
        config.SES = new aws.SES({
          apiVersion: "2010-12-01"
        });
      }
      this._transporter = nodemailer.createTransport(config);
    } catch (ex) {
      this._transporter = undefined;
    }
  }

  async init(): Promise<void> {
    this._params.templates = this._params.templates || "./templates";
  }

  _getTemplate(name) {
    if (!this._templates[name]) {
      // Load template
      let templateDir = this._params.templates + "/";
      if (!fs.existsSync(templateDir)) {
        templateDir = __dirname + "/../templates/";
        if (!fs.existsSync(templateDir)) {
          this._webda.log("WARN", "No template found for", name);
          return;
        }
      }
      if (!fs.existsSync(templateDir + name)) {
        this._webda.log("WARN", "No template found for", name);
        return;
      }
      this._templates[name] = new Email({
        views: {
          root: templateDir,
          options: {
            extension: this._params.templatesEngine || "mustache"
          }
        }
      });
    }
    return this._templates[name];
  }

  /**
   *
   * @params options Options to pass to the sendMail option of the nodemailer module
   * @params callback to pass to the sendMail
   */
  async send(options, callback = undefined): Promise<any> {
    if (this._transporter === undefined) {
      this._webda.log("ERROR", "Cannot send email as no transporter is defined");
      return Promise.reject("Cannot send email as no transporter is defined");
    }
    if (!options.from) {
      options.from = this._params.sender;
    }
    if (options.template) {
      if (!options.replacements) {
        options.replacements = {};
      }
      options.replacements.now = new Date();
      let template = this._getTemplate(options.template);
      if (template) {
        let result = await template.renderAll(options.template, options.replacements);
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
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/Mailer",
      label: "Mailer",
      description:
        "Implements a mailer to use in other services, it is used by the Authentication if you activate the email",
      logo: "images/icons/email.png",
      configuration: {
        schema: {
          type: "object",
          properties: {
            config: {
              type: "object"
            }
          },
          required: ["config"]
        }
      }
    };
  }
}

export { Mailer, TemplatesMap, IEmailTemplate };
