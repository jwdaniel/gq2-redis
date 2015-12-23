var util = require('util');
var EventEmitter = require('events').EventEmitter;

function ISuber(emitter) {
	EventEmitter.call(this);

	this._count = 0;
	this._subscriptions = {};
	this._psubscriptions = {};
	this._regexes = {};
	this._emitter = emitter;
}

util.inherits(ISuber, EventEmitter);
module.exports = ISuber;

ISuber.prototype.sub = function() {
	var self = this;

	for (var i = 0; i < arguments.length; i++) {
		var channel = String(arguments[i]);
		if (self._subscriptions[channel]) return;

		(function(channel) {
			var listener = function(message) {
				if (arguments.length > 1) return; // ignore EventEmitter's newListener and removeListener events
				self.emit('msg', channel, message);
			};
			self._emitter.on(channel, listener);
			self._count++;
			self._subscriptions[channel] = listener;
			self.emit('sub', channel, self._count);
		})(channel);
	}
};

ISuber.prototype.unsub = function() {
	var self = this;

	for (var i = 0; i < arguments.length; i++) {
		var channel = String(arguments[i]);

		if (!self._subscriptions[channel]) return;

		self._emitter.removeListener(channel, self._subscriptions[channel]);
		self._count--;
		delete self._subscriptions[channel];
		self.emit('unsub', channel, self._count);
	}

	if (!arguments.length) {
		// unsubscribe all channels
		var channels = Object.keys(self._subscriptions);
		if (channels.length > 0) {
			self.unsubscribe.apply(self, channels);
		}
	}
};

ISuber.prototype.psub = function() {
	var self = this;

	for (var i = 0; i < arguments.length; i++) {
		var pattern = arguments[i];
		if (!(pattern instanceof RegExp)) {
			pattern = new RegExp(String(pattern));
		}
		var key = String(pattern);
		if (self._psubscriptions[key]) return;

		(function(pattern, key) {
			var listener = function(message) {
				if (arguments.length > 1) return; // ignore EventEmitter's newListener and removeListener events
				self.emit('pmsg', pattern, this.event, message); // this.event is the channel name
			};
			self._emitter.on(pattern, listener);
			self._count++;
			self._psubscriptions[key] = listener;
			self._regexes[key] = pattern;
			self.emit('psub', pattern, self._count);
		})(pattern, key);
	}
};

ISuber.prototype.punsub = function() {
	var self = this;

	for (var i = 0; i < arguments.length; i++) {
		var pattern = arguments[i];
		if (!(pattern instanceof RegExp)) {
			pattern = new RegExp(String(pattern));
		}
		var key = String(pattern);
		if (!self._psubscriptions[key]) return;

		self._emitter.removeListener(pattern, self._psubscriptions[key]);
		self._count--;
		delete self._psubscriptions[key];
		delete self._regexes[key];
		self.emit('punsub', pattern, self._count);
	}

	if (!arguments.length) {
		// unsubscribe all patterns
		var patterns = Object.keys(self._regexes).map(function(key) {
			return self._regexes[key];
		});
		self.punsub.apply(self, patterns);
	}
};

