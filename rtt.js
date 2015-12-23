var async = require('async');
var WebSocket = require('ws');

	var ws = new WebSocket('ws://localhost:8080/hello');
	ws.on('open', function open() {
		ws.send(Date.now().toString());
	});
	ws.on('message', function(data, flags) {
		console.log('rtt = %d ms', Date.now() - parseInt(data));
		ws.close()
	});

