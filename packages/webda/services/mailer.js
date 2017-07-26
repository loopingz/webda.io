"use strict";

var nodemailer = require('nodemailer');
var ses = require('nodemailer-ses-transport');
const Service = require("./service");
const fs = require('fs');
const Mustache = require('mustache');
const EmailTemplate = require('email-templates').EmailTemplate

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
  /** @ignore */
  constructor(webda, name, params) {
    super(webda, name, params);
    try {
      params.config = params.config || {};
      if (params.config.transport === 'ses' && !params.config.SES) {
        let aws = require('aws-sdk');
        aws.config.update(params.config);
        params.SES = new aws.SES({apiVersion: '2010-12-01'});
      }
      this._transporter = nodemailer.createTransport(params.config);  
    } catch (ex) {
      this._transporter = undefined;
    }
  }

  init() {
    this._templates = {};
    if (!this._params.templates) {
      this._params.templates = "./templates";
    }
  }

  _getTemplate(name) {
    if (!this._templates[name]) {
      // Load template
      console.log(__dirname);
      let templateDir = this._params.templates + '/' + name;
      if (!fs.existsSync(templateDir)) {
        templateDir = __dirname + '/../templates/' + name;
        if (!fs.existsSync(templateDir)) {
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
  send(options, callback) {
    if (this._transporter === undefined) {
      console.log("Cannot send email as no transporter is defined");
      return Promise.reject("Cannot send email as no transporter is defined");
    }
    if (!options.from) {
      options.from = this._params.sender;
    }
    var promise = Promise.resolve();
    if (options.template) {
      if (!options.replacements) {
        options.replacements = {};
      }
      options.replacements.now = new Date();
      let template = this._getTemplate(options.template);
      if (template) {
        promise = promise.then(() => {
          return template.render(options.replacements);
        }).then((result) => {
          if (result.subject) {
            options.subject = result.subject;
          }
          if (result.html) {
            options.html = result.html;
          }
          if (result.text) {
            options.text = result.text;
          }
        });
      } else {
        throw Error("Unknown mail template");
      }
    }
    return promise.then(() => {
      return this._transporter.sendMail(options, callback)
    });
  }

  /** @ignore */
  static getModda() {
    return {
      "uuid": "Webda/Mailer",
      "label": "Mailer",
      "description": "Implements a mailer to use in other services, it is used by the Authentication if you activate the email",
      "webcomponents": [],
      "logo": "images/placeholders/email.png",
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

module.exports = Mailer