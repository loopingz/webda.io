"use strict";
import * as Email from "email-templates";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import path = require("path");
import { Ident, User } from "..";
import { ModdaDefinition } from "../core";
import { NotificationService } from "./notificationservice";
import { Service, ServiceParameters } from "./service";

interface IEmailTemplate {
  renderAll(file: string, options: any);
}

interface TemplatesMap {
  [key: string]: IEmailTemplate;
}

/**
 * Represent a mailer service
 */
export interface MailerService extends NotificationService {
  /**
   *
   * @params options Options to pass to the sendMail option of the nodemailer module
   * @params callback to pass to the sendMail
   */
  send(options: MailerSendOptions, callback: () => void): Promise<any>;
}

interface MailerSendOptions {
  /**
   * Sender of the email
   *
   * @default parameters.sender
   */
  from?: string;
  /**
   * Destination of the email
   */
  to: string;
  /**
   * Template to user
   */
  template?: string;
  /**
   * Replacements for the template
   */
  replacements?: any;
  /**
   * Subject of the email
   *
   * Can be overriden by the template
   */
  subject?: string;
  /**
   * HTML of the email
   *
   * Can be overriden by the template
   */
  html?: string;
  /**
   * Text of the email
   *
   * Can be overriden by the template
   */
  text?: string;
}

export class MailerParameters extends ServiceParameters {
  /**
   * Specify which foldeer contains templates
   *
   * @default "templates"
   */
  templates?: string;
  /**
   * Template engine to usee
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
  SES: any;

  constructor(params: any) {
    super(params);
    this.templates ??= "./templates";
    if (!this.templates.endsWith("/")) {
      this.templates += "/";
    }
    this.templatesEngine ??= "mustache";
    this.emailTemplateOptions ??= {};
    this.emailTemplateOptions.juiceResources ??= {};
    this.emailTemplateOptions.juiceResources.webResources ??= {};
    this.emailTemplateOptions.juiceResources.webResources.relativeTo ??= path.resolve(this.templates);
  }
}

export abstract class AbstractMailer<T extends ServiceParameters = ServiceParameters>
  extends Service<T>
  implements MailerService
{
  /**
   * @inheritdoc
   */
  abstract send(options: MailerSendOptions, callback?: () => void): Promise<any>;
  /**
   * @inheritdoc
   */
  abstract hasNotification(notification: string);

  /**
   * If user has an email
   * @param user
   * @returns
   */
  async handleNotificationFor(user: User | Ident): Promise<boolean> {
    return user.getEmail() !== null;
  }

  /**
   * @override
   */
  async sendNotification(user: User | Ident, notification: string, replacements: any): Promise<void> {
    let email = user.getEmail();
    if (!email) {
      throw new Error(`Cannot find a valid email for ${user.__type} '${user.getUuid()}'`);
    }
    return this.send({
      template: notification,
      replacements: {
        ...replacements
      },
      to: email
    });
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
class Mailer<T extends MailerParameters = MailerParameters> extends AbstractMailer<T> {
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
    let config: any = {};
    Object.assign(config, this.parameters);
    if (config.transport === "ses" && !config.SES) {
      let aws = require("aws-sdk");
      aws.config.update(config);
      config.SES = new aws.SES({
        apiVersion: "2010-12-01"
      });
    }
    this._transporter = nodemailer.createTransport(config);
  }

  /**
   * Get a template by name
   *
   * @param name
   * @returns
   */
  _getTemplate(name: string) {
    if (!this._templates[name]) {
      if (!this.hasNotification(name)) {
        this._webda.log("WARN", "No template found for", name);
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
   * Check if the email template exists
   *
   * @param name
   * @returns
   */
  hasNotification(name: string): boolean {
    // Load template
    return fs.existsSync(this.parameters.templates + name);
  }

  /**
   *
   * @params options Options to pass to the sendMail option of the nodemailer module
   * @params callback to pass to the sendMail
   */
  async send(options: MailerSendOptions, callback = undefined): Promise<any> {
    if (this._transporter === undefined) {
      this._webda.log("ERROR", "Cannot send email as no transporter is defined");
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

  /**
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/Mailer",
      label: "Mailer",
      description: "Allow your application to send email including a templating system"
    };
  }
}

export { Mailer, TemplatesMap, IEmailTemplate };
