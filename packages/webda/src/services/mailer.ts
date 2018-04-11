"use strict";
import {
  Service
} from '../index';
var nodemailer = require('nodemailer');
var ses = require('nodemailer-ses-transport');
const fs = require('fs');
const Mustache = require('mustache');
const EmailTemplate = require('email-templates').EmailTemplate

interface IEmailTemplate {
  render(options: any);
}

interface TemplatesMap {
  [key: string]: IEmailTemplate;
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
 */
class Mailer extends Service {
  _transporter: any;
  _templates: TemplatesMap = {};
  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    try {
      let config: any = {};
      Object.assign(config, params.config);
      if (config.transport === 'ses' && !config.SES) {
        let aws = require('aws-sdk');
        aws.config.update(config);
        config.SES = new aws.SES({
          apiVersion: '2010-12-01'
        });
      }
      this._transporter = nodemailer.createTransport(config);
    } catch (ex) {
      this._transporter = undefined;
    }
  }

  init() {
    this._params.templates = this._params.templates || "./templates";
  }

  _getTemplate(name) {
    if (!this._templates[name]) {
      // Load template
      let templateDir = this._params.templates + '/' + name;
      if (!fs.existsSync(templateDir)) {
        templateDir = __dirname + '/../templates/' + name;
        if (!fs.existsSync(templateDir)) {
          this._webda.log('WARN', 'No template found for', name);
          return;
        }
      }
      this._templates[name] = new EmailTemplate(templateDir);
    }
    return this._templates[name];
  }

  /**
   *
   * @params options Options to pass to the sendMail option of the nodemailer module
   * @params callback to pass to the sendMail
   */
  async send(options, callback = undefined): Promise < any > {
    if (this._transporter === undefined) {
      this._webda.log('ERROR', 'Cannot send email as no transporter is defined');
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
        let result = await template.render(options.replacements);
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
    return this._transporter.sendMail(options, callback)
  }

  /** @ignore */
  static getModda() {
    return {
      "uuid": "Webda/Mailer",
      "label": "Mailer",
      "description": "Implements a mailer to use in other services, it is used by the Authentication if you activate the email",
      "webcomponents": [],
      "logo": "images/icons/email.png",
      "configuration": {
        "default": {
          "config": {}
        },
        "schema": {
          type: "object",
          properties: {
            "config": {
              type: "object"
            }
          },
          required: ["config"]
        }
      }
    }
  }
}

export {
  Mailer,
  TemplatesMap,
  IEmailTemplate
}
