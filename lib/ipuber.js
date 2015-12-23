function IPuber(emitter) {
	this._emitter = emitter;
}

IPuber.prototype.pub = function(channel, message) {
	this._emitter.emit(channel, message);
};

module.exports = IPuber;

