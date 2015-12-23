var iPushComet = require('./ipush/ipushcmt');

var iPush = function(conf) {
	this.conf = conf;
	this.iplink = new iPushComet(this.conf);
	this.iplink.setProperty("packChannelData", false);
}

iPush.prototype.connect = function() {
	var self = this;
	self.iplink.onStatus = function(e) {
		// console.log('Got: ' + e.code + ' ' + e);
		switch (e.code) {
		case 200: // connection ready
			if (typeof(self.onConnectReady) == "function") {
				setTimeout(function() {
					self.onConnectReady(e)
				}, 0);
			}
			break;
		case -100: // connection lost
		case -101: // connection failed
		case -102: // connection timeout
		case -104: // init fail
		case -105: // init timeout
		case -999: // api not ready
			// do reconnect ?
			break;
		case 600: // channel command ok
		case 601: // channel sub failed
		case 604: // channel not sub
		case 700: // subject command ok
		case 704: // subject not sub
		default:
			break;
		}
	};

	self.iplink.connect(self.conf.a, self.conf.b, self.conf.c, self.conf.d);
};

iPush.prototype.disconnect = function() {
	this.iplink.disconnect();
};

iPush.prototype.onChannelMessage = function(func) {
	this.iplink.onChannelMessage = func;
};

iPush.prototype.onSubjectMessage = function(func) {
	this.iplink.onSubjectMessage = func;
};

iPush.prototype.onReady = function(func) {
	this.iplink.onReady = func;
};

iPush.prototype.onConnectReady = function(func) {
	this.onConnectReady = func;
};

iPush.prototype.subChannel = function(channelString) {
	this.iplink.subChannel(channelString);
};

iPush.prototype.unsubChannel = function(channelString) {
	this.iplink.unsubChannel(channelString);
};

module.exports = iPush;

