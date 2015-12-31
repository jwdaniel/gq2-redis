var async = require('async');
var WebSocket = require('ws');

var clients = 0;
var recv = 0;

for (var i = 0; i < 2000; i++) {
	var delay = Math.random(100)*2000 + 500;
	setTimeout(function() {
		var ws = new WebSocket('ws://localhost:8080/hello');
		ws.on('open', function open() {
			clients++;
			ws.send(JSON.stringify({cmd: 'sub', symbol: 'ICE.TWF.TXO.201601.*'}));
		});
		ws.on('message', function(data, flags) {
			recv++;
		});
	}, delay);
}

setInterval(function() {
	console.log("client/recv = %d/%d", clients, recv);
}, 2000);

