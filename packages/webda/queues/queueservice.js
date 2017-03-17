"use strict";
const Service = require("../services/service");

class QueueService extends Service {

	sendMessage(params) {
		throw Error("Abstract service");
	}

	receiveMessage() {
		throw Error("Abstract service");
	}

	deleteMessage(id) {
		throw Error("Abstract service");
	}

	size() {
		throw Error("Abstract service");
	}

	_workerReceiveMessage() {
		try {
			this.receiveMessage().then( (items) => {
				if (items.length === 0) {
					setTimeout(this._workerReceiveMessage.bind(this), 1000);
				}
				var promise = Promise.resolve();
				for (var i = 0; i < items.length; i++) {
					((msg) => {
						let event = JSON.parse(msg.Body);
						promise = promise.then( () => {
							return this.callback(event);
						}).then( () => {
							return this.deleteMessage(msg.ReceiptHandle);
						});
					})(items[i]);
				}
				promise.then( () => {
					setTimeout(this._workerReceiveMessage.bind(this), 1000);
				}).catch( (err) => {
					console.log('Error with notification', err);
					setTimeout(this._workerReceiveMessage.bind(this), 1000);
				});
			});
		} catch (err) {
			this.pause *= 2;
			console.log(err);
			setTimeout(this._workerReceiveMessage.bind(this), this.pause * 1000);
		}
	}

	worker(callback) {
		this.pause = 1;
		this.callback = callback;
		this._workerReceiveMessage();
	}

	__clean() {
		
	}
}

module.exports = QueueService;