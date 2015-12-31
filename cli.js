var async = require('async');
var WebSocket = require('ws');

var clients = 0;
var recv = 0;

async.times(1, function(n, next) {
	var ws = new WebSocket('ws://localhost:8080/hello');
	ws.on('open', function open() {
		clients++;
		// ws.send(JSON.stringify({cmd: 'sub', symbol: 'ICE.TWF.TXO.201601.*'}));
		ws.send(JSON.stringify({cmd: 'sub', symbol: 'ICE.TWF.TXO.201601.P.8500'}));
	});
	ws.on('message', function(data, flags) {
		recv++;
		console.log(data);
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

