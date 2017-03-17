const QueueService = require("./queueservice");

class MemoryQueueService extends QueueService {

	init(config) {
		super.init(config);
		this._queue = {};
	}

	size() {
		return Object.keys(this._queue).length;
	}

	sendMessage(params) {
		var uid = '';
		this._queue[uid] = {Body: params, Claimed: 0, ReceiptHandle: uid};
		return Promise.resolve();
	}

	receiveMessage() {
		for (var i in this._queue) {
			if (this._queue[i].Claimed < new Date().getTime() - 30000) {
				this._queue[i].Claimed = new Date().getTime();
				return this._queue[i];
			}
		}
		return [];
	}

	deleteMessage(receipt) {
		if (!this._queue[receipt]) {
			delete this._queue[receipt];
		}
	}

	__clean() {
		this._queue = {};
	}
}

module.exports = MemoryQueueService