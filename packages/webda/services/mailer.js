"use strict";

var nodemailer = require('nodemailer');
var ses = require('nodemailer-ses-transport');
const Service = require("./service");

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
		super(webda, name, params)
		try {
			this._transporter = nodemailer.createTransport(params.config);
		} catch (ex) {
			this._transporter = undefined;
		}
	}

	init() {

	}

	/**
	 *
	 * @params options Options to pass to the sendMail option of the nodemailer module
	 * @params callback to pass to the sendMail
	 */
	send(options, callback) {
		if (this._transporter === undefined) {
			console.log("Cannot send email as no transporter is defined");
			return;
		}
		if (!options.from) {
			options.from = this._params.sender;
		}
		return this._transporter.sendMail(options, callback);
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
					"config": {

					}
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