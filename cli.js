var async = require('async');
var WebSocket = require('ws');

var clients = 0;
var recv = 0;

async.times(1000, function(n, next) {
	var ws = new WebSocket('ws://localhost:8080/hello');
	ws.on('open', function open() {
		clients++;
		// ws.send(Date.now().toString(), {mask: true});
	});
	ws.on('message', function(data, flags) {
		recv++;
		// console.log('Roundtrip time: ' + (Date.now() - parseInt(data)) + 'ms', flags);
	});
/*
	ws.on('error', function(err) {
		console.log(err);
	});
	ws.on('close', function() {
		console.log('disconnected');
	});
*/
	// next(null, null);
});

setInterval(function() {
	console.log("client/recv = %d/%d", clients, recv);
}, 2000);

