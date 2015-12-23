var icetech = {};
icetech.iPushUtil = require('./ipushutil.js').iPushUtil;
icetech.iPushConn = require('./ipushconn.js');

icetech.iPushComet = function(cfg) {
    var icmtPrefix         = "";
	var wsPrefix           = "";
    var server             = null;
    var port               = 80;
    var path               = "";
    var doSSL              = false;
    var streamReconnTime   = 30000;  // COMET streaming reconnect interval, default 30sec
    var streamReconnLength = 200;
    var cometTimeout       = 2500;   // COMET(Ajax) request timeout (ms)
    var initTimeout        = 10000;  // WebSocket xinit response timeout (ms)
    var loginTimeout       = 10000;  // WebSocket login timeout (ms)
	var xDomain            = null;
    var publishOK          = true;
    var self               = this;
	
	var company            = null;
    var product            = null;
    var username           = null;
    var password           = null;
	
    var heartbeatInterval  = 15000;  // heart beat interval (ms)
    var heartbeatLimit     = 1;      // heart beat timeout  (ms)
	
    // ipush attributes
    var properties = {
        SubjectPacketSize:  2048,
        PacketDelay:        200,
        BlockTimeout:       5000,
        AckTimeout:         10000,
        ResendInterval:     5000};
    
	this.cometReqCnt = 0;
	
	// add by chi-hung
	this.reqQueue = new Array();
		
	this.netWorkerID = null;
	this.netWorker = function() {
	    
		clearTimeout(this.netWorkerID);
		
		if (!this.ipushconn.isConnected()){
		    this.reqQueue.length = 0;
			return;
		}
		
		if (this.reqQueue.length == 0) {
		    //this.netWorkerID = setTimeout(function() {self.netWorker();}, 10);
			return;
		}
		
		var ackWaitInterval = 100;
		var req = this.reqQueue.shift();
		
		if (req.isPersistent && req.isAckWaiting == true) {
		    if ( (this.ipushconn.sbj_ackReceived == true) || ( (req.AckTimeout != null) && req.AckTimeout > this.getAckTimeout()) ) {
			    if (this.ipushconn.sbj_ackReceived)
				    this.ipushconn.sbj_ackReceived = false;
				this.netWorkerID = setTimeout(function() {self.netWorker();}, 0);
                return;				
			}
			if (req.ResendInterval != null && req.ResendInterval < this.getResendInterval()) {
                req.ResendInterval += ackWaitInterval;
				req.AckTimeout += ackWaitInterval;
				this.reqQueue.unshift(req);
				this.netWorkerID = setTimeout(function() {self.netWorker();}, ackWaitInterval);
				return;
			}			
		}
		
        var ipushcmt = this;
		var ipush = this.ipushconn;	
		   	if (ipush.wsConn) {
			    
				ipush.wsConn.send(req.msg);
				
				if (req.isPersistent ) {
					req.isAckWaiting = true;
					if (req.AckTimeout == null) 
						req.AckTimeout = ackWaitInterval;
					else
					    req.AckTimeout += ackWaitInterval;
                    req.ResendInterval = 0;						
					ipushcmt.reqQueue.unshift(req);
					ipushcmt.netWorkerID = setTimeout(function() {ipushcmt.netWorker();}, ackWaitInterval);
                	return;
				}
				
				if (req.isPacketDelay == true)
					ipushcmt.netWorkerID = setTimeout(function() {ipushcmt.netWorker();}, ipushcmt.getPacketDelay());
						
				ipushcmt.netWorkerID = setTimeout(function() {ipushcmt.netWorker();}, 0); 
				
			}	
	}
	
	/*
	this.startNetWorker = function() {
	    this.netWorkerID = setTimeout(function() {self.netWorker();}, 10);
	}
	*/
	
	this.stopNetWorker = function() {
	    if (this.netWorkerID != null)
		    clearTimeout(this.netWorkerID);
		//this.reqQueue.splice(0);
		this.reqQueue.length = 0;
	}
	
	this.enqueueMessage = function(msg) {
	    var req = new Object();
		req.msg = msg;
		//req.timeout_retry = 2;
		//req.seqerr_retry = 1;
		this.reqQueue.push(req);
		
		if (this.reqQueue.length == 1)
		    this.netWorker();
	}
	
	this.enqueueChannelCmd = function(ch, cmd) {
	    var req = new Object();
		req.msg = cmd;
		req.channel = ch;
		this.reqQueue.push(req);
		
		if (this.reqQueue.length == 1)
		    this.netWorker();
	}
	
	this.enqueueChannelData = function(ch, msg, isPacketDelay) {
	    var req = new Object();
		req.msg = msg;
		req.channel = ch;
		if ( typeof(isPacketDelay) != "undefined" && isPacketDelay != null )
		   req.isPacketDelay = isPacketDelay;
		this.reqQueue.push(req);
	}
	
	this.enqueueSubjectCmd = function(sbj, cmd) {
	    var req = new Object();
		req.msg = cmd;
		req.subject = sbj;
		this.reqQueue.push(req);
		
		if (this.reqQueue.length == 1)
		    this.netWorker();
	}
	
	this.enqueueSubjectData = function(sbj, msg, isPersistent, isPacketDelay) {
	    var req = new Object();
		req.msg = msg;
		req.subject = sbj;
		if (typeof(isPersistent) != "undefined" && isPersistent != null)
		    req.isPersistent = isPersistent;
		if (typeof (isPacketDelay) != "undefined" && isPacketDelay != null)
            req.isPacketDelay = isPacketDelay;		
		this.reqQueue.push(req);
	}
	// end Add
	
    this.isPublishOK = function() {
        return publishOK;
    }
    
    this.allowPublish = function() {
        publishOK = true;
    }
    
    this.suspendPublish = function() {
        publishOK = false;
    }
    
    for (var p in properties) {(function(){
        var pp = properties[p];
        self["get"+p] = function() {
            return pp;
        };
    })();}
    
    this.setSubjectPacketSize = function(v) {
        if (v < 1) {
            properties.SubjectPacketSize = 1;
        } else if (v > 7168) {
            properties.SubjectPacketSize = 7168;
        } else {
            properties.SubjectPacketSize = v;
        }
    }
    
    this.setPacketDelay = function(v) {
        if (v < 0) {
            properties.PacketDelay = 0;
        } else if (v > 3600000) {
            properties.PacketDelay = 3600000;
        } else {
            properties.PacketDelay = v;
        }
    }
    
    this.setBlockTimeout = function(v) {
        if (v < 1) {
            properties.BlockTimeout = 1;
        } else if (v > 3600000) {
            properties.BlockTimeout = 3600000;
        } else {
            properties.BlockTimeout = v;
        }
    }
    
    this.setAckTimeout = function(v) {
        if (v < 0) {
            properties.AckTimeout = 0;
        } else if (v > 3600000) {
            properties.AckTimeout = 3600000;
        } else {
            properties.AckTimeout = v;
        }
    };
    
    this.setResendInterval = function(v) {
        if (v < 1) {
            properties.ResendInterval = 1;
        } else if (v > 3600000) {
            properties.ResendInterval = 3600000;
        } else {
            properties.ResendInterval = v;
        }
    }
    
    this.getIcmtPrefix = function() {
        return icmtPrefix;
    }
    
	this.getWsPrefix = function() {
        return wsPrefix;
    }
	
    this.getStreamReconnTime = function() {
        return streamReconnTime;
    }
    
    this.getStreamReconnLength = function() {
        return streamReconnLength;
    }
    
    this.getCometTimeout = function() {
        return cometTimeout;
    }
    
    this.getInitTimeout = function() {
        return initTimeout;
    }
    
	this.getLoginTimeout = function() {
	    return loginTimeout;
	}
	
    this.getXDomain = function() {
        return xDomain;
    }
	
	this.getHeartBeatInterval = function() {
	    return heartbeatInterval;
	}
	
	this.getHeartBeatLimit = function() {
	    return heartbeatLimit;
	}
	
    // ===== iPushComet object initialization =====
    if (typeof(cfg) != "undefined") {
        if (typeof(cfg.server) == "string" && cfg.server != null) {
            server = cfg.server.toLowerCase();
        }
        if (typeof(cfg.port) == "number" && cfg.port > 0) {
            port = cfg.port;
        }
        if (typeof(cfg.SSL) != "undefined" && cfg.SSL) {
            doSSL = true;
        }
        if (typeof(cfg.scriptpath) == "string" && cfg.scriptpath != null) {
            path = "";
            if (cfg.scriptpath.toLowerCase().indexOf("http://") != 0)
                path = path + "http://";
            if (cfg.scriptpath.lastIndexOf("/") == cfg.scriptpath.length-1)
                path = path + cfg.scriptpath;
            else
                path = path + cfg.scriptpath + "/";
        }
        if (typeof(cfg.streamReconnTime) == "number") {
            if (cfg.streamReconnTime < 5) {
                streamReconnTime = 5000;
            } else if (cfg.streamReconnTime > 1000) {
                streamReconnTime = 1000000;
            } else {
                streamReconnTime = cfg.streamReconnTime * 1000;
            }
        }
        if (typeof(cfg.streamReconnLength) == "number") {
            if (cfg.streamReconnLength < 10) {
                streamReconnLength = 10;
            } else if (cfg.streamReconnLength > 1000) {
                streamReconnLength = 1000;
            } else {
                streamReconnLength = cfg.streamReconnLength;
            }
        }
        if (typeof(cfg.cometTimeout) == "number") {
            if (cfg.cometTimeout < 300) {
                cometTimeout = 300;
            } else if (cfg.cometTimeout > 30000) {
                cometTimeout = 30000;
            } else {
                cometTimeout = cfg.cometTimeout;
            }
        }
        if (typeof(cfg.initTimeout) == "number") {
            if (cfg.initTimeout < 5000) {
                initTimeout = 5000;
            } else {
                initTimeout = cfg.initTimeout;
            }
        }
		
		if (typeof(cfg.loginTimeout) == "number") {
            if (cfg.loginTimeout < 10000) {
                loginTimeout = 10000;
            } else {
                loginTimeout = cfg.loginTimeout;
            }
        }
		
		if (typeof(cfg.heartbeatInterval) == "number") {
		    if (cfg.heartbeatInterval < 1000)
			    heartbeatInterval = 1000;
			else
                heartbeatInterval = cfg.heartbeatInterval;			
		}
		if (typeof(cfg.heartbeatLimit) == "number") {
		    if (cfg.heartbeatLimit < 0)
			    heartbeatLimit = 1;
			else
			    heartbeatLimit = cfg.heartbeatLimit;
		}
		
    }
    if (server != null) {
        if (doSSL) {
            icmtPrefix = "https://" + server;
			wsPrefix   = "wss://"   + server;
        } else {
            icmtPrefix = "http://" + server;
			wsPrefix   = "ws://"   + server;
        }
        if (port != 80){
            icmtPrefix = icmtPrefix + ":" + port;
			wsPrefix   = wsPrefix + ":" + port;
		}
    } else {
	    if (doSSL){
		    icmtPrefix = "https://" + document.domain;			
		    wsPrefix = "wss://" + document.domain;
		} else {
            icmtPrefix = "http://" + document.domain;		
			wsPrefix = "ws://" + document.domain;
		}
        if (port != 80){
		    icmtPrefix = icmtPrefix + ":" + port;
            wsPrefix = wsPrefix + ":" + port;
        }			
	} 
	
    var pjChkReady = function() {
    	self.init();
		self.ready = true;
        setTimeout(function() {self.onReady();}, 0);
	};
    
    setTimeout(pjChkReady, 10);
}

// prototype
icetech.iPushComet.prototype = {
    bDebugVersion:      false,
    packChannelData:    true,

	getProperty: function(prop) {
        if (typeof(prop) == "undefined" || prop == null) {
            return null;
        } else if (prop == 'ApiVersion') {
            return '3.4.45';
        } else if (prop == 'packChannelData') {
            return this.packChannelData;
        } else if (prop == 'subjectPacketSize') {
            return this.getSubjectPacketSize();
        } else if (prop == 'packetDelay') {
            return this.getPacketDelay();
        } else if (prop == 'blockTimeout') {
            return this.getBlockTimeout();
        } else if (prop == 'ackTimeout') {
            return this.getAckTimeout();
        } else if (prop == 'resendInterval') {
            return this.getResendInterval();
        } else if (prop == 'websocketEnabled') {
            return true;
		} else {
            return null;
        }
	},
	
	setProperty: function(prop, val) {
        if (typeof(prop) == "undefined" || prop == null || typeof(val) == "undefined" || val == null) {
            return;
        } else if (prop == 'packChannelData') {
            if (val)
                this.packChannelData = true;
            else
                this.packChannelData = false;
        } else if (prop == 'subjectPacketSize') {
            this.setSubjectPacketSize(val);
        } else if (prop == 'packetDelay') {
            this.setPacketDelay(val);
        } else if (prop == 'blockTimeout') {
            this.setBlockTimeout(val);
        } else if (prop == 'ackTimeout') {
            this.setAckTimeout(val);
        } else if (prop == 'resendInterval') {
            this.setResendInterval(val);
        } else {
            return;
        }
	},

     isConnected: function() {
        if (typeof(this.ipushconn) == "undefined")
            return false;
        else
            return this.ipushconn.isConnected();
    },

    // ==== methods =====
	init: function() {
        this.ipushutil = new icetech.iPushUtil(this);
        this.ipushconn = new icetech.iPushConn(this);
	},
    
    toString: function() {
        return ("iPush COMET JS-API " + this.getProperty("ApiVersion") + " " + this.getIcmtPrefix());
    },
    
	connect: function(a, b, c, d) {
	    if (!this.ready) {
            return -1;
        }
        this.disconnect();
		
		if (typeof(a) == "undefined" || typeof(b) == "undefined" || 
		    typeof(c) == "undefined" || typeof(d) == "undefined" ||
			a == null || b == null || c == null || d == null ){
        
            // TODO ...
			return -1;
        }
		
		this.company  = a;
		this.product  = b;
		this.username = c;
		this.password = d;

        this.ipushconn.connect();		
	},
	
	disconnect: function() {
        if (!this.isConnected()) {
            return -1;
        }
		
	    this.ipushconn.disconnect();		
		return 1;
	},

	subChannel: function(ch) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
		
		var cmd = "xsub "+this.ipushutil.getChannelString(ch) + "\r\n"; 
		this.enqueueChannelCmd(ch,cmd);
		return true;
	},

	unsubChannel: function(ch) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
		
		var cmd = "xunsub "+this.ipushutil.getChannelString(ch) + "\r\n";
		this.enqueueChannelCmd(ch,cmd);
		return true;
	},

	sendChannelData: function() {
		if (!this.ipushconn.ready2Publish())
            return icetech.iPushUtil.CONNECTION_UNREADY;
		if (arguments.length < 2)
            return icetech.iPushUtil.INVALID_DATA;
		if (typeof(arguments[1]) == "string")
			return this.ipushconn.sendChannelString(arguments[0], arguments[1]);
		else
			return this.ipushconn.sendChannelData(arguments[0], arguments[1]);
	},
	
	subSubject: function(sbj) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
        
		var cmd = this.ipushconn.scrambleString("x$js "+sbj+"\r\n");
		this.enqueueSubjectCmd(sbj,cmd);
		return true;
	},

	unsubSubject: function(sbj) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
        var cmd = this.ipushconn.scrambleString("x$ju "+sbj+"\r\n");
		this.enqueueSubjectCmd(sbj,cmd);
		return true;
	},

	subDSubject: function(sbj, dname) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
        
		var cmd = this.ipushconn.scrambleString("x$jd "+sbj+" "+dname+"\r\n");
		this.enqueueSubjectCmd(sbj,cmd);
		return true;
	},

	unsubDSubject: function(sbj, dname) {
        if (!this.isConnected()) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
        var cmd = this.ipushconn.scrambleString("x$jr "+sbj+" "+dname+"\r\n");
		this.enqueueSubjectCmd(sbj,cmd);
		return true;
	},
	
	sendNPSubjectData: function() {
		if (!this.ipushconn.ready2Publish()) {
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
		var p = 1;
		var q = 3;
		if (arguments.length < 2) {
			return icetech.iPushUtil.INVALID_DATA;
		} else if (arguments.length == 3)  {
			p = arguments[2];
		} else if (arguments.length >= 4) {
			p = arguments[2];
			q = arguments[3];
		}
		if (typeof(arguments[1]) == "string")
			return this.ipushconn.sendSubjectString(arguments[0], arguments[1], p, q, icetech.iPushUtil.NON_PERSISTENT, icetech.iPushUtil.TOPIC, 0);
		else if (Object.prototype.toString.call(arguments[1]) === '[object Array]'/*arguments[1].constructor == Array*/)
			return this.ipushconn.sendSubjectData(arguments[0], arguments[1], p, q, icetech.iPushUtil.NON_PERSISTENT, icetech.iPushUtil.TOPIC, 0);
        else
            return icetech.iPushUtil.INVALID_DATA;
	},
	
	sendPSubjectData: function() {
		if (!this.ipushconn.ready2Publish()) {
            return icetech.iPushUtil.CONNECTION_UNREADY;
        }
		var p = 1;
		var q = 3;
		var ttl = 86400;
		if (arguments.length < 2) {
			return icetech.iPushUtil.INVALID_DATA;
		}
		if (arguments.length > 4) {
			ttl = 0;	// set ttl according to arguments
		}
		switch (arguments.length) {
			case 8:
				ttl = arguments[7];
			case 7:
				ttl += arguments[6] * 60;
			case 6:
				ttl += arguments[5] * 3600;
			case 5:
				ttl += arguments[4] * 86400;
			case 4:
				q = arguments[3];
			case 3:
				p = arguments[2];
		}
		if (typeof(arguments[1]) == "string")
			return this.ipushconn.sendSubjectString(arguments[0], arguments[1], p, q, icetech.iPushUtil.PERSISTENT, icetech.iPushUtil.TOPIC, ttl);
		else if (Object.prototype.toString.call(arguments[1]) === '[object Array]'/*arguments[1].constructor == Array*/)
			return this.ipushconn.sendSubjectData(arguments[0], arguments[1], p, q, icetech.iPushUtil.PERSISTENT, icetech.iPushUtil.TOPIC, ttl);
        else
            return icetech.iPushUtil.INVALID_DATA;
	},
	
	sendNPQueueData: function() {
		if (!this.ipushconn.ready2Publish())
			return icetech.iPushUtil.CONNECTION_UNREADY;
		var p = 1;
		var q = 3;
		if (arguments.length < 2) {
			return icetech.iPushUtil.INVALID_DATA;
		} else if (arguments.length == 3)  {
			p = arguments[2];
		} else if (arguments.length >= 4) {
			p = arguments[2];
			q = arguments[3];
		}
		if (typeof(arguments[1]) == "string")
			return this.ipushconn.sendSubjectString(arguments[0], arguments[1], p, q, icetech.iPushUtil.NON_PERSISTENT, icetech.iPushUtil.QUEUE, 0);
		else if (Object.prototype.toString.call(arguments[1]) === '[object Array]'/*arguments[1].constructor == Array*/)
			return this.ipushconn.sendSubjectData(arguments[0], arguments[1], p, q, icetech.iPushUtil.NON_PERSISTENT, icetech.iPushUtil.QUEUE, 0);
        else
            return icetech.iPushUtil.INVALID_DATA;
	},
	
	sendPQueueData: function() {
		if (!this.ipushconn.ready2Publish())
			return icetech.iPushUtil.CONNECTION_UNREADY;
		var p = 1;
		var q = 3;
		var ttl = 86400;
		if (arguments.length < 2) {
			return icetech.iPushUtil.INVALID_DATA;
		}
		if (arguments.length > 4) {
			ttl = 0;	// set ttl according to arguments
		}
		switch (arguments.length) {
			case 8:
				ttl = arguments[7];
			case 7:
				ttl += arguments[6] * 60;
			case 6:
				ttl += arguments[5] * 3600;
			case 5:
				ttl += arguments[4] * 86400;
			case 4:
				q = arguments[3];
			case 3:
				p = arguments[2];
		}
		if (typeof(arguments[1]) == "string")
			return this.ipushconn.sendSubjectString(arguments[0], arguments[1], p, q, icetech.iPushUtil.PERSISTENT, icetech.iPushUtil.QUEUE, ttl);
		else if (Object.prototype.toString.call(arguments[1]) === '[object Array]'/*arguments[1].constructor == Array*/)
			return this.ipushconn.sendSubjectData(arguments[0], arguments[1], p, q, icetech.iPushUtil.PERSISTENT, icetech.iPushUtil.QUEUE, ttl);
        else
            return icetech.iPushUtil.INVALID_DATA;
	},
    
    pjStatus: function(ev) {
        var self = this;
    	if (typeof(this.onStatus) == "function") {
            switch (ev.code) {
            case 12002:
            case 12029:
            case 12030:
            case 12031:
                // connection closed by server.
            case 12152:
            case 13030:
                ev.code = icetech.iPushUtil.COMET_CMD_FAIL;
                ev.message = "COMET request fail";
                break;
            }
            if (ev.code <= -1000 && !this.bDebugVersion)
                return;
    		setTimeout(function() {self.onStatus(ev)}, 0);
    	}
    },

    pjChannelMessage: function(ev) {
        var self = this;
    	if (typeof(this.onChannelMessage) == "function") {
    		setTimeout(function() {self.onChannelMessage(ev)}, 0);
    	}
    },

    pjSubjectMessage: function(ev) {
        var self = this;
    	if (typeof(this.onSubjectMessage) == "function") {
    		setTimeout(function() {self.onSubjectMessage(ev)}, 0);
    	}
    },
	
	pjStatisticsUpdate: function(ev) {
	    var self = this;
		if (ev.type == 1 && typeof(this.onInitElapsedTime) == "function") {
		    setTimeout(function() { self.onInitElapsedTime(ev.elapsedTime) }, 0);
		} else if (ev.type == 2 && typeof(this.onLoginElapsedTime) == "function") {
		    setTimeout(function() { self.onLoginElapsedTime(ev.elapsedTime) }, 0);
		}
	}
}

module.exports = icetech.iPushComet;
