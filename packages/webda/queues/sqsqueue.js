"use strict";
const QueueService = require("./queueservice");
const AWS = require('aws-sdk');

class SQSQueueService extends QueueService {

	init(config) {
		super.init(config);
		if (this._params.accessKeyId === undefined || this._params.accessKeyId === '') {
			this._params.accessKeyId = process.env["WEBDA_AWS_KEY"];
		}
		if (this._params.secretAccessKey === undefined || this._params.secretAccessKey === '') {
			this._params.secretAccessKey = process.env["WEBDA_AWS_SECRET"];
		}
		if (this._params.accessKeyId && this._params.secretAccessKey) {
            AWS.config.update({accessKeyId: this._params.accessKeyId, secretAccessKey: this._params.secretAccessKey});
      	}
		this.sqs = new AWS.SQS();
		if (!this._params.WaitTimeSeconds) {
			this._params.WaitTimeSeconds = 20;
		}
	}

	size() {
		return this.sqs.getQueueAttributes({AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"], QueueUrl: this._params.queue}).promise().then( (res) => {
			return Promise.resolve(parseInt(res['Attributes']['ApproximateNumberOfMessages']) + parseInt(res['Attributes']['ApproximateNumberOfMessagesNotVisible']));
		});
	}

	sendMessage(params) {
		var sqsParams = {};
		sqsParams.QueueUrl = this._params.queue;
		sqsParams.MessageBody = JSON.stringify(params);
		return this.sqs.sendMessage(sqsParams).promise();
	}

	receiveMessage() {
		this.queueArg = {QueueUrl: this._params.queue, WaitTimeSeconds: this._params.WaitTimeSeconds};
		return new Promise( (resolve, reject) => {
			this.sqs.receiveMessage(this.queueArg).promise().then((data) => {
				if (!data.Messages) {
					return Promise.resolve([]);
				}
				return Promise.resolve(data.Messages);
			});
		});
	}

	deleteMessage(receipt) {
		return new Promise( (resolve, reject) => {
			this.sqs.deleteMessage({QueueUrl: this._params.queue, ReceiptHandle: receipt}, (err, data) => {
				if (err) {
					return reject(err);
				}
				resolve(data);
			});
		});
	}

	__clean() {
		return this.sqs.purgeQueue({QueueUrl: this._params.queue}).promise();
	}

}

module.exports = SQSQueueService;