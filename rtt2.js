var async = require('async');
var WebSocket = require('ws');

	var ws = new WebSocket('ws://localhost:8080/rtt');
	ws.on('open', function open() {
		setInterval(function() {
			// var o = ['rtt'].concat(process.hrtime()).join()
			var o = {cmd: 'rtt', ts: process.hrtime().join() };
			ws.send(JSON.stringify(o));
		}, 1000);
	});
	ws.on('message', function(data, flags) {
		var t1 = process.hrtime();
		var o = JSON.parse(data);
		var t0 = o.ts.split(',')
		var diff = t1[1] - t0[1];
		console.log('rtt = %s/%s, diff = %d', t1, t0, diff);
		// ws.close();
	});
