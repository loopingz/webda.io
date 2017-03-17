const QueueService = require("./queueservice");
const AWS = require('aws-sdk');

class SQSQueueService extends QueueService {

	init(config) {
		super.init(config);
		if (this._params.accessKeyId && this._params.secretAccessKey) {
            AWS.config.update({accessKeyId: this._params.accessKeyId, secretAccessKey: this._params.secretAccessKey});
      	}
		this.sqs = new AWS.SQS();
		if (!this._params.WaitTimeSeconds) {
			this._params.WaitTimeSeconds = 20;
		}
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
			this.sqs.receiveMessage(this.queueArg, (err, data) => {
				if (err) {
					reject(err);
				}
				if (!data.Messages) {
					return resolve([]);
				}
				resolve(data.Messages);
			});
		});
	}

	deleteMessage(receipt) {
		return new Promise( (resolve, reject) => {
			return this.sqs.deleteMessage({QueueUrl: this._params.queue, ReceiptHandle: receipt}, (err, data) => {
				if (err) {
					reject(err);
				}
				resolve(data);
			});
		});
	}

}

module.exports = SQSQueueService;