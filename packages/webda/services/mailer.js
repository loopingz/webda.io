"use strict";

var nodemailer = require('nodemailer');
var ses = require('nodemailer-ses-transport');
const Service = require("./service");

class Mailer extends Service {
	constructor(webda, name, params) {
		super(webda, name, params)
		// smtps://user%40gmail.com:pass@smtp.gmail.com
		try {
			this._transporter = nodemailer.createTransport(params.config);
		} catch (ex) {
			this._transporter = undefined;
		}
	}

	init() {

	}

	send(options, callback) {
		if (this._transporter === undefined) {
			console.log("Cannot send email as no transporter is defined");
			return;
		}
		console.log("Send an email");
		return this._transporter.sendMail(options, callback);
	}
}

module.exports = Mailer