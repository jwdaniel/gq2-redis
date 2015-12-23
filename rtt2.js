var async = require('async');
var WebSocket = require('ws');

	var ws = new WebSocket('ws://localhost:8080/rtt');
	ws.on('open', function open() {
		// ws.send(Date.now().toString());
		ws.send(process.hrtime().toString());
	});
	ws.on('message', function(data, flags) {
		// console.log('rtt = %d ms', Date.now() - parseInt(data));
		console.log('rtt = %s/%s', process.hrtime().toString(), data);
		// ws.send(Date.now().toString());
		ws.send(process.hrtime().toString());
		// ws.close();
	});
