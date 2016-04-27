"use strict";

var nodemailer = require('nodemailer');

class Mailer {
	constructor(webda, params) {
		this._webda = webda;
		this._params = params;
		// smtps://user%40gmail.com:pass@smtp.gmail.com
		this._transporter = nodemailer.createTransport(params.config);
	}

	init() {

	}

	send(options, callback) {
		console.log("Send an email");
		this._transporter.sendMail(options, callback);

	}
}

module.exports = Mailer