var cluster  = require('cluster');
var cpus = require('os').cpus().length;
var WebSocketServer = require('ws').Server;
var redis = require('redis');
var async = require('async');
var IPubSub = require('./lib/ipubsub.js');

var prev_g = 0;
var prev_s = 0;

if (cluster.isMaster) {	
	var clients = {};
	var msggot = {};
	var msgsent = {};

	for (var i = 0; i < cpus; i++) {
		cluster.fork();		
	}
	cluster.on('online', function(worker) {
		console.log('online: worker id = %s', worker.id);
		clients[worker.id] = 0;
		msggot[worker.id] = 0;
		msgsent[worker.id] = 0;
	});
	cluster.on('exit', function(worker, code, signal) {
		console.log('exit: worker id = %s, exit code = %s', worker.id, signal || code);
		delete clients[worker.id];
		delete msggot[worker.id];
		delete msgsent[worker.id];
		if (!worker.suicide) {
			console.log('starting a new worker');
			cluster.fork();
		}
	});
	Object.keys(cluster.workers).forEach(function(id) {
		cluster.workers[id].on('message', function(msg) {
			clients[id] = msg.clients;
			msggot[id] = msg.msggot;
			msgsent[id] = msg.msgsent;
		});
	});
	setInterval(function() {
		var c = 0, g = 0, s = 0;
		Object.keys(clients).forEach(function(id) {
			c += clients[id];
			g += msggot[id];
			s += msgsent[id];
		})
		console.log("client/got/sent = %d/%d/%d, diff = %d/%d, clients = %j", c, g, s, g-prev_g, s-prev_s, clients);
		prev_g = g; prev_s = s;
	}, 2000);
} else {
	var clients = 0;
	var msggot = 0;
	var msgsent = 0;

	var init = function(cb) {
		var redisSuber = redis.createClient();
		var redisClient = redis.createClient();
		var iPuber = IPubSub.createPublisher();

		redisSuber.on("ready", function(channel, count) {
			// redisSuber.psubscribe("__keyevent@0__:*");
			redisSuber.subscribe("quote.symbol");
			redisSuber.on('message', function(channel, key) {
				redisClient.hgetall(key, function(err, res) {
					// console.log("%s: %s", key, JSON.stringify(res));
					msggot++;
					iPuber.pub(key, JSON.stringify(res));
				});
			});
			setTimeout(cb, 0);
		});
	};

	var initWS = function(cb) {
		var wss = new WebSocketServer({ port: 8080 });
		wss.on('connection', function(ws) {
			clients++;
			var iSuber = IPubSub.createSubscriber();
			// iSuber.psub("ICE.*");
			iSuber.psub("ICE.TWF.TXO.201601.*");
			iSuber.on("pmsg", function(pattern, key, msg) {
				msgsent++;
				ws.send(msg);
			});
			ws.on('message', function(message) {
				// console.log('recv: %s', message);
				// ws.send(Date.now().toString());
				ws.send(message);
			});
			ws.on('close', function(code, message) {
				clients--;
			});
		});
		setTimeout(cb, 0);
		setInterval(function() {
			// console.log("client/got/sent = %d/%d/%d", clients, msggot, msgsent);
			process.send({clients: clients, msggot: msggot, msgsent: msgsent});
		}, 2000)
	};

	async.series([
		init,
		initWS
	], function(err, results) {
	});
}

