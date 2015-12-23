var util = require('util');
var PatternEmitter = require('pattern-emitter');
var IPuber = require('./ipuber');
var ISuber = require('./isuber');

var IPubSub = (function() {

	var _emitter = new PatternEmitter();
	_emitter.setMaxListeners(0);

	var createPublisher = function() {
		return new IPuber(_emitter);
	}

	var createSubscriber = function() {
		return new ISuber(_emitter);
	}

	return {
		createPublisher: createPublisher,
		createSubscriber: createSubscriber
	}
})()

module.exports = IPubSub;


