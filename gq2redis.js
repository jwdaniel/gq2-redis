var async = require('async');
var redis = require('redis');
var iPush = require('./lib/ipush.js');
var MSG2 = require('./lib/msg2.js');
var gq2conf = require('./gq2.config.json');

var gq2, redisClient, redisPub;

gq2 = new iPush(gq2conf);
gq2.onReady(function() {
	redisClient = redis.createClient();
	redisPub = redis.createClient();
	redisClient.on("ready", function(channel, count) {
		gq2.connect();
	});
});
gq2.onConnectReady(function() {
	console.log('gq2.onConnectReady(): do subChannel()');
	gq2.subChannel('0x50-0x5f');
});
gq2.onChannelMessage(function(ev) {
	var m = new MSG2();
	m.parseByte(ev.data);
	if (m.str[0] != null) {
		// console.log('channel: ' + ev.channel);
		// console.log('data: ' + m.toString());
		var key = m.str[0];
		var obj = {};
		for ( var k in m.str ) {
			obj['s' + k] = m.str[k];
		}
		for ( var k in m.val ) {
			obj['v' + k] = m.val[k];
		}
		// console.log(JSON.stringify(obj));
		redisClient.hmset(m.str[0], obj);
		redisClient.expire(m.str[0], 2);
		redisPub.publish("quote.symbol", m.str[0]);
	}
});

/*
setTimeout(function() {
	gq2.disconnect();
	redisClient.quit();
}, 5000);
*/

