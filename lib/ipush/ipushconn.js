var icetech = {};
icetech.iPushUtil = require('./ipushutil').iPushUtil;
icetech.BlockData = require('./ipushutil').BlockData;
icetech.iPushComet = require('./ipushcmt');
var WebSocket = require('ws');

icetech.iPushConn = function(ipcmt) {
    this.ipushcmt = ipcmt;
    if (ipcmt != null)
        this.ipushutil = ipcmt.ipushutil;

	this.heartbeatTimer    = null;
	this.heartbeatCount    = 0;
 	
	this.connStartTime  = 0;
	
	this.aBlkHash = new Array();
    
    var bReady2Publish = true;
    
    this.ready2Publish = function () {
        return (bReady2Publish && this.bLoginOK);
    }
    
    this.suspendPublish = function () {
        bReady2Publish = false;
    }
    
    this.resumePublish = function () {
        bReady2Publish = true;
    }
	
	this.enqueueBlockChannelData = function(channel,msg) {
	    var chstr = this.ipushutil.getChannelBytes(channel);
		if (chstr == null || msg == null || msg.length <= 0) {
			return -1;
		}
		
		var data_len = msg.length;
		var blk_header = new Array();
		for (var i=0; i<4; i++) {
			blk_header[i] = chstr.charCodeAt(i);
		}
		this.setChanHeader(blk_header, 4, "JiPush", msg.length);
		var blk_msg = new Array();
		var poffsize = new Array();
		var len = 0;
		var offset = 0;
		var blk_idx = 0;
		while (data_len > 0) {
		    poffsize[0] = blk_header.length;
		    poffsize[1] = iPush.BUFFER_MAX - blk_header.length;
			blk_msg.length = 0;
			blk_msg = blk_msg.concat(blk_header);
			if (data_len < icetech.iPushUtil.DEFAULT_CHANNEL_PKT_SIZE) 
			    len = this.ipushutil.packBlock(blk_msg, poffsize, msg, offset, data_len);
		    else 
			    len = this.ipushutil.packBlock(blk_msg, poffsize, msg, offset, icetech.iPushUtil.DEFAULT_CHANNEL_PKT_SIZE);
			data_len -= len;
			offset += len;
			blk_msg.length = poffsize[0];
			if (data_len == 0)
		        this.ipushcmt.enqueueChannelData(channel, icetech.iPushUtil.joinString(blk_msg) + "\r\n", false);
			else
                this.ipushcmt.enqueueChannelData(channel, icetech.iPushUtil.joinString(blk_msg) + "\r\n", true); 			
			blk_header[5]++;
		    if (blk_header[5] == 0)
			    blk_header[5] = 0x20;
			if (blk_header.length > 8){
			    blk_header.length = 8;
			}
			blk_idx++;
		}
		
		if (this.ipushcmt.reqQueue.length == blk_idx)
		    this.ipushcmt.netWorker();
	}
		
    var messageid = 1;
        
	// Send message with specified subject to iPush server. 
	this.sendSubjectData = function(subject, msg, priority, qos, mode, protocol, ttl) {
		if (!this.bLoginOK) {
			this.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Connection not ready"});
			return icetech.iPushUtil.CONNECTION_UNREADY;
		}
		if (typeof(subject) != "string" || subject == null || subject.length <= 0 || subject.length > icetech.iPushUtil.MAX_SUBJECT_NAME) {
			return icetech.iPushUtil.INVALID_SUBJECT;
		}
		if (msg == null || msg.length <= 0) {
			return icetech.iPushUtil.INVALID_DATA;
		}

		var data_len = msg.length;
		var isPersistent = (mode == icetech.iPushUtil.PERSISTENT);
		var blk_header = new Array();
		var nhead = this.setMesgHeader(blk_header, subject, priority, qos, mode, protocol, ttl);
		var nbody = this.setClientHeader(blk_header, nhead, msg.length);
        var poffsize = new Array();
		var blk_msg  = new Array();
		var max = icetech.iPushUtil.BUFFER_MAX - nbody;
		if (max < 3) 
			max = 3;
		poffsize[0] = nbody;
        poffsize[1] = max;
		var len = 0;
		var offset = 0;
		var isPacketDelay = false;
		
		if (!isPersistent &&  msg.length < this.ipushcmt.getSubjectPacketSize()) {
			this.setMesgSecurity(blk_header, messageid++);
			if (messageid > 0x7fffffff) {
				messageid = 1;
			}
						
			blk_msg = blk_msg.concat(blk_header);
			len = this.ipushutil.packBlock(blk_msg, poffsize, msg, 0, data_len); 
			if (  len < 0)
			    return 0;

			blk_msg.length = poffsize[0];   // remove tailing useless elements
			
			// need to add persisten handling here!!!
			//this.sendScrambleMessage(icetech.iPushUtil.joinString(sbj_text) + "CC\r\n");
			this.ipushcmt.enqueueSubjectData(subject, this.scrambleString(icetech.iPushUtil.joinString(blk_msg) + "CC\r\n"));
			if (this.ipushcmt.reqQueue.length == 1)
			    this.ipushcmt.netWorker();
					
		} else {	// persistent or block mode
            var blk_idx = 0;
			while (data_len > 0) {
			    this.setMesgSecurity(blk_header, messageid++);
		        if (messageid > 0x7fffffff) 
			        messageid = 1;
				blk_msg.length = 0;
				blk_msg = blk_msg.concat(blk_header);
                if (data_len < this.ipushcmt.getSubjectPacketSize()) 
			       len = this.ipushutil.packBlock(blk_msg, poffsize, msg, offset, data_len);
		        else 
			        len = this.ipushutil.packBlock(blk_msg, poffsize, msg, offset, this.ipushcmt.getSubjectPacketSize());
				data_len -= len;
                offset += len;
                blk_msg.length = poffsize[0];
				
				if (data_len == 0)
				    isPacketDelay = false;
				else
				    isPacketDelay = true;
				this.ipushcmt.enqueueSubjectData(subject, this.scrambleString(icetech.iPushUtil.joinString(blk_msg) + "CC\r\n"), isPersistent, isPacketDelay);
				
				blk_header[nhead]++;
		        if (blk_header[nhead] == 0) 
			        blk_header[nhead] = 0x20;
		        blk_header.length = nhead + 3;				
		        poffsize[0] = blk_header.length;
                poffsize[1] = icetech.iPushUtil.BUFFER_MAX - poffsize[0];
                if (poffsize[1] < 3)
                    poffsize[1] = 3;
                blk_idx++;					
			}
			
            if (this.ipushcmt.reqQueue.length == blk_idx)
			    this.ipushcmt.netWorker();			
		}
		return msg.length;
	}
}

icetech.iPushConn.prototype = {
    nSectionKey:        0,
    nKeyInit:           0,
    sVCid:              "00",
    bLoginOK:           false,
    bStop:              true,
    ajStreaming:        null,
    lastActiveTime:     0,
    streamTimer:        null,
	loginTimer:         null,
	initTimer:          null,
	requestTimer:       null,
	streamTimeoutCnt:   0,
    ipushcmt:           null,
    ipushutil:          null,
    ajaxBrdReady:       false, // ajax cross-domain bridge ready?       
	browser:            null,
	browserVersion:     0,      
	nLastBlkID:         -1,
	aBlkHash:           null,
	BLK_HASH_SIZE:		16,
    sbj_ackReceived:    false,
	wsConn:             null,   

    isConnected: function() {
        return this.bLoginOK;
    },
    
    getCometTimeout: function() {
        if (typeof(this.ipushcmt) == "undefined")
            return 5000;
        else if (typeof(this.ipushcmt.getCometTimeout) != "function")
            return 5000;
        else
            return this.ipushcmt.getCometTimeout();
    },

    disconnect: function(bReport) {
        if (!this.bLoginOK)
            return;
		
		this.ipushcmt.stopNetWorker();
		
		this.bLoginOK = false;
        this.bStop = true;
        clearTimeout(this.streamTimer);
		
		    if (this.heartbeatTimer)
			    clearInterval(this.heartbeatTimer);
				
			if (this.wsConn) {
			    this.wsConn.close();
                this.wsConn = null;
                this.dispatchEvent({type:"status", code:-100, message:"Conneciton lost"});				
			}
    },
    
	doIFrameStreaming: function(isReconn) {
        
		if (this.ipushcmt.getXDomain() != null && !this.ajaxBrdReady) {
		    var check_counter = 0;
			window.__icbrdg = this;
			self = this;
			var idiv = document.createElement('Div');
			document.body.appendChild(idiv);
            var targeturl = this.ipushcmt.getIcmtPrefix() + '/icmt/xx?d=' + document.domain;
			var bid = setInterval(function(){
			            if (typeof(self.newXDomainAjaxObj) == "function"){
                            clearInterval(bid);
							self.ajaxBrdReady = true;
							self.doIEhtmlfile(false);
                        } else if (++check_counter >= 50) {
                            clearInterval(bid);
                            ipush.dispatchEvent({type:"status", code:-101, message:"ajax bridge not available!"});							
                        }				
			    }, 100);
			idiv.innerHTML = "<iframe id='ipcmt_bridge' frameborder='0' style='width:0px;height:0px;border:0px display:none' src='"+targeturl+"'></iframe>";
		    return;
		}
		
		if (this.ajStreaming) {
            var elm = document.getElementById('streamfrm');
            elm.parentNode.removeChild(elm);
            this.ajStreaming = null;
        }
    	
		var idiv = document.createElement('Div');
        var cmd = this.ipushcmt.getIcmtPrefix()+"/icmt/00?t=s&n="+this.ipushcmt.getStreamReconnLength();
		if (this.ipushcmt.getXDomain() != null)
		    cmd += ("&d="+document.domain);
		if (isReconn)
		    cmd += ("&v="+this.sVCid);
		//if (this.ipushcmt.getXDomain() != null)
		//    cmd += "&x=t";	
        window.__icbrdg = this;
        document.body.appendChild(idiv);
        
       	var self = this;
		var bReconn = isReconn;
		this.streamTimer = setTimeout(function() {
            // stream connection fail handling
            if (self.ajStreaming) {
                var elm = document.getElementById('streamfrm');
                elm.parentNode.removeChild(elm);
                self.ajStreaming = null;
            }
			self.streamTimeoutCnt++;
            if (self.streamTimeoutCnt >= 2) {
                self.streamTimeoutCnt = 0;
                if (bReconn)
			        self.dispatchEvent({type:"status", code:-100, message:"connection lost"});
			    else
			        self.dispatchEvent({type:"status", code:-101, message:"connect fail"});
                self.disconnect(false);
            } else {
                self.doIFrameStreaming(bReconn);
            }
		}, this.ipushcmt.getCometTimeout());
        
		idiv.innerHTML = "<iframe id='streamfrm' style='width:0px;height:0px;border:0px display:none' src='"+cmd+"'></iframe>";
        this.ajStreaming = document.getElementById('streamfrm');
	},
	
	doXHRStreaming: function(isReconn) {
	    
		if (this.ipushcmt.getXDomain() != null && !this.ajaxBrdReady) {
		    var check_counter = 0;
			window.__icbrdg = this;
			self = this;
			var idiv = document.createElement('Div');
			document.body.appendChild(idiv);
            var targeturl = this.ipushcmt.getIcmtPrefix() + '/icmt/xx?d=' + document.domain;
			var bid = setInterval(function(){
			            if (typeof(self.newXDomainAjaxObj) == "function"){
                            clearInterval(bid);
							self.ajaxBrdReady = true;
							self.doXHRStreaming(false);
                        } else if (++check_counter >= 50) {
                            clearInterval(bid);
                            self.dispatchEvent({type:"status", code:-101, message:"ajax bridge not available!"});							
                        }				
			    }, 100);
			idiv.innerHTML = "<iframe id='ipcmt_bridge' frameborder='0' style='width:0px;height:0px;border:0px display:none' src='"+targeturl+"'></iframe>";
		    return;
		}
		
		if (this.ajStreaming) {
            this.ajStreaming.abort();
            this.ajStreaming = null;
        }
		/*
        if (this.bStop) {
            return;
        }
		*/
        var datacnt = 0;
        var callb = function(ipushconn) {
            var ipush = ipushconn;
            if (typeof(this.ajpos) == 'undefined')
                this.ajpos = 0;
						
            if (this.readyState == 3) {
                if ((this.status == 200 || this.status == 0) && this.responseText.length > 0) {
                    var recvdata = "";
					if (this.ajpos < this.responseText.length) {
					    recvdata = this.responseText.slice(this.ajpos);
                       	var pos=0;
                        var off=0;
                        while ((off = recvdata.indexOf("\n", pos)) >= 0) {
                            ipush.onData.call(ipush, recvdata.substr(pos, off-pos+1), true);
                            pos = off + 1;
                        }
                        this.ajpos += pos;
                    }
                }
            } else if (this.readyState == 4) {
                if (this.status == 200 || this.status == 0) {
                    var recvdata = "";
                    if (this.ajpos < this.responseText.length) {
					    recvdata = this.responseText.slice(this.ajpos);
                       	var pos=0;
                        var off=0;
                        while ((off = recvdata.indexOf("\n", pos)) >= 0) {
                            ipush.onData.call(ipush, recvdata.substr(pos, off-pos+1), true);
                            pos = off + 1;
                        }
                    }
                } else {
                    ipush.dispatchEvent({type:"status", code:this.status, message:this.statusText});
                }
            }
        };

        var self = this;
            
        var cmd = this.ipushcmt.getIcmtPrefix()+"/icmt/00?t=u&n="+this.ipushcmt.getStreamReconnLength();
  	    if (isReconn)
		    cmd += ("&v="+this.sVCid);
        var ajobj = null;
		if (this.ipushcmt.getXDomain() != null) 
		    ajobj = this.newXDomainAjaxObj(callb);
		else
		    ajobj = this.ipushcmt.newAjaxObj(callb);
        
        this.ajStreaming = ajobj;
      
        ajobj.open("GET", cmd, true);
        ajobj.setRequestHeader("Cache-Control","no-cache, no-store");
        ajobj.setRequestHeader("Pragma", "no-cache");
		ajobj.overrideMimeType('text/plain; charset=utf-8');
		
		var bReconn = isReconn;
        this.streamTimer = setTimeout(function() {
            // stream connection fail handling
            if (self.ajStreaming) {
                self.ajStreaming.abort();
                self.ajStreaming = null;
            }
            self.streamTimeoutCnt++;
            if (self.streamTimeoutCnt >= 2) {
                self.streamTimeoutCnt = 0;
                //self.dispatchEvent({type:"status", code:-997, message:"COMET stream connect fail"});
                if (bReconn)
			        self.dispatchEvent({type:"status", code:-100, message:"connection lost"});
			    else
			        self.dispatchEvent({type:"status", code:-101, message:"connect fail"}); 
				self.disconnect(false);
            } else {
                self.doXHRStreaming(bReconn);
            }
        }, this.ipushcmt.getCometTimeout());
        
		ajobj.send();
    },
    
	doWebSocketConnect:function() {
	    if (this.wsConn){
            this.wsConn.close();
			this.wsConn = null;
			this.disconnect();
        }

        var host = this.ipushcmt.getWsPrefix() + "/icmt/00";
        var self = this;
		this.wsConn = new WebSocket(host);
        this.wsConn.on('open', function() {
            var ipush = self;
			clearTimeout(self.streamTimer);
			self.streamTimer = null;
            ipush.initTimer = setTimeout(function() {
                if (ipush.wsConn) {
				    ipush.wsConn.close();
                    ipush.wsConn = null;
				    ipush.initTimer = null;
					ipush.disconnect();
                    ipush.dispatchEvent({type:"status", code:-105, message:"init timeout"});
                }					
            }, self.ipushcmt.getInitTimeout());			
        });
        this.wsConn.on('message', function(evt) {
			if (self.heartbeatTimer) {
			    clearInterval(self.heartbeatTimer);
                self.heartbeatCount = 0;				
			}
			
			self.onData(evt, true);

            if (self.bLoginOK) {
			    self.heartbeatTimer = setInterval( function(){
                    self.heartbeatCount++;
					if (self.heartbeatCount > self.ipushcmt.getHeartBeatLimit()) {
                        self.disconnect();
                    } else {
                        self.ipushcmt.enqueueMessage("xpin\r\n");
                    }
				}, self.ipushcmt.getHeartBeatInterval());
            }			
        });
        this.wsConn.on('close', function() {
            self.disconnect();
		});
        this.wsConn.on('error', function() {
            //if (self.wsConn){
			//    self.wsConn.close();
			//	self.wsConn = null;
			self.dispatchEvent({type:"status", code:-1001, message:"WebSocket Error"});
			//}
        });
        this.streamTimer = setTimeout(function() {
            // stream connection fail handling
            if (self.wsConn) {
			    self.wsConn.close();
                self.wsConn	= null;
			    self.streamTimer = null;
				self.disconnect();
         	    self.dispatchEvent({type:"status", code:-101, message:"connect fail"});
			}
        }, this.ipushcmt.getCometTimeout());
        this.connStartTime = (new Date()).getTime(); 		
	},
	
	connect:function() {
	   this.doWebSocketConnect();
    },
	
	// COMET callback function
    onData: function(data, /*len, datacnt,*/ raw) {
        if (typeof(data) != "string" /*|| typeof(len) != "number" || data == null || len <= 0*/)
            return;
        var now = new Date();
        this.lastActiveTime = now.getTime();
        var arData = new Array();
        //if (len > data.length)
        var len = data.length;
        //alert('ondata: '+data);
        if (typeof(raw) == "undefined" || raw == false) {
            for (var i=0; i<len; i++) {
                var tt = data.charCodeAt(i);
                if (tt == '\\') {
                    switch (data.charCodeAt(i+1)) {
                    case '\\':
                        arData[i] = '\\';
                        break;
                    case '\'':
                        arData[i] = '\'';
                        break;
                    case '"':
                        arData[i] = '"';
                        break;
                    case '%':
                        arData[i] = '%';
                        break;
                    case 'a':
                        arData[i] = 0x07;
                        break;
                    case 'b':
                        arData[i] = 0x08;
                        break;
                    case 't':
                        arData[i] = 0x09;
                        break;
                    case 'n':
                        arData[i] = 0x0a;
                        break;
                    case 'v':
                        arData[i] = 0x0b;
                        break;
                    case 'f':
                        arData[i] = 0x0c;
                        break;
                    case 'r':
                        arData[i] = 0x0d;
                        break;
                    }
                    i++;
                } else {
                    arData[i] = tt;
                }
            }
            arData = this.ipushutil.dataUnpack(arData);
        } else {
            for (var i=0; i<len; i++) {
                arData[i] = data.charCodeAt(i);
            }
		}
		
        var tmpdata = "";
		var idx=0;
		while (idx < arData.length) {
		    tmpdata += String.fromCharCode(arData[idx]);
			if (arData[idx] == "\n".charCodeAt(0)) 
			{
			    if (arData[0] == "x".charCodeAt(0))
				{
                    this.procCommand(tmpdata);
					arData.splice(0,idx+1)
				}
                else
                    this.procMessage(arData.splice(0,idx+1));
                idx=0;
				tmpdata = "";
                continue;				
			}
			idx++;
		}
	},
    
	procCommand: function(cmd) {
	    if (typeof(cmd) == "undefined" || cmd == null || cmd.length == 0)
            return;		
	    if (!this.doXCommand(cmd)) 
            this.doXCommand(this.descrambleString(cmd));
    },
	
	procMessage: function(msg) {
        if (!this.bLoginOK || typeof(msg) == "undefined" || msg == null || msg.length == 0)
		    return;
		if (msg[0] == "%".charCodeAt(0)) {
		    var ret = this.descrambleData(msg, 0, msg.length);
			if (ret < 0) {
				this.dispatchEvent({type:"status", code:ret, message:"Subject message decode error"});
			} else {
				if ((msg[1] & 0x10) == 0x10) {
					this.parseJMSSubjectMessage(msg);
				} else {
					this.parseSubjectMessage(msg);
				}
			}
        } else {
            this.parseChannelMessage(msg);
        } 
    },	
	
    dispatchEvent: function(ev) {
        if (ev && typeof(ev.type) == "string") {
            if (ev.type == "status") {
                ev.toString = function() {
                    return this.message;
                }
                this.ipushcmt.pjStatus(ev);
                
            } else if (ev.type == "subject") {
                ev.ipushutil = this.ipushutil;
                ev.toString = function() {
                    return this.ipushutil.UTF82String(this.data);
                }
                ev.message = ev.toString();
                this.ipushcmt.pjSubjectMessage(ev);

            } else if (ev.type == "channel") {
                ev.ipushutil = this.ipushutil;
                ev.toString = function() {
                    return this.ipushutil.UTF82String(this.data);
                }
                ev.message = ev.toString();
                this.ipushcmt.pjChannelMessage(ev);
            }
        }
    },
    
    /*
	getCmdSeqChar: function() {
        var rstr = String.fromCharCode(this.nCmdSeq);
        this.nCmdSeq = (((this.nCmdSeq - 97) + this.nCmdSeqInc) % 26) + 97;
        return rstr;
    },
    */
	
	doLogin: function() {
	    var login_info = "xlogin "+this.ipushcmt.company+" "+this.ipushcmt.product+
		                 " "+this.ipushcmt.username+" "+this.ipushcmt.password+"\r\n";
        var cmd = this.scrambleString(login_info);
		    if (this.wsConn){
			    var ipush = this; 
			    this.loginTimer = setTimeout(function(){
                                        if (ipush.wsConn){
										    ipush.wsConn.close();
											ipush.wsConn = null;
										    ipush.dispatchEvent({type:"status", code:-107, message:"auth. timeout"});
										}	
									}, this.ipushcmt.getLoginTimeout());
				this.wsConn.send(cmd);
			}
	},
	
    doXCommand: function(data) {
        //alert("do cmd: "+data)
        var msg = data;
		var tail = msg.length;
		while (tail > 0 && msg.charAt(tail-1) < ' ')
			tail--;
        var arg = msg.substr(0, tail).split(" ");
		var cmd = arg[0];
        if (cmd == "xnop") {
            return true;
        } else if (cmd == "xkey") {
            var res = parseInt(arg[1], 16);
            if (isNaN(res)) {
                return false;
            }
            this.nKeyInit = res;
            //alert("keyinit: "+this.nKeyInit);
        } else if (cmd == "xinit") {
			//a xinit msg
			var r1 = parseInt(arg[1], 16);
/*
            if (isNaN(r1) || (!true && typeof(arg[2]) == "undefined"))
			    return false;
*/
            if (isNaN(r1)) return false;
			
			this.nSectionKey = r1;
			
			// if (!true) this.sVCid = arg[2];
			
			if (this.streamTimer) {
                clearTimeout(this.streamTimer);
                this.streamTimer = null;
				this.streamTimeoutCnt = 0;
            }
			
			if (this.initTimer) {
			    clearTimeout(this.initTimer);
				this.initTimer = null;
			}
            
			this.doLogin();
			
			if (this.connStartTime != 0){
			    var init_elapsed = (new Date()).getTime() - this.connStartTime; 
			    this.ipushcmt.pjStatisticsUpdate({type:1,elapsedTime:init_elapsed});
			}
			
		} else if (cmd == "xaucode") {
			var code = parseInt(arg[1].substr(0, 3));
            if (isNaN(code)) {
                return false;
            }
			
			clearTimeout(this.loginTimer);
			clearTimeout(this.requestTimer);
			
			if (code == 200) {
				this.bLoginOK = true;
				this.dispatchEvent({type:"status", code:200, message:"login_ok"});
				this.ipushcmt.pjStatisticsUpdate({type:2, elapsedTime:(new Date()).getTime() - this.connStartTime});
				
			} else {
				code = -code;
                this.dispatchEvent({type:"status", code:code, message:arg[1].substr(4)});
			}
		} else if (cmd == "xpin") {
            this.ipushcmt.enqueueMessage("xpon\r\n");
        } else if (cmd == "xmg") {
			var code = parseInt(arg[1].substr(0, 3));
			var mesg = arg[1].substr(4);
			var param = arg[2];
            if (isNaN(code) || typeof(param) == "undefined") {
                return false;
            }
			if (code >= 600 && code <= 699) {
				param = (param.charAt(0) == '\"') ? param.substr(1) : "0x" + param;
			} else if (code >= 700 && code <= 799) {
				if (arg[3])
					param = param + "-" + arg[3];
			} else if (code >= 400 && code <= 999) {
				code = -code;
			} else {
				return false;
			}
            this.dispatchEvent({type:"status", code:code, message:mesg, param:param});
		} else if (cmd.substr(0, 4) == "xack") {   //persistent message ack
			this.sbj_ackReceived = true;
			this.ipushcmt.netWorker();
		} else if (cmd == "xcmtstream") {          // start streaming
            // streaming connection re-established
			if (this.streamTimer) {
                clearTimeout(this.streamTimer);
                this.streamTimer = null;
				this.streamTimeoutCnt = 0;
            }
		} else if (cmd == "xcmtmaerts") {          // end streaming
            var self = this;
            setTimeout(function(){ self.doXHRStreaming(true)}, 0);
            
        } else {
            return false;
        }
        return true;
    },
    
    parseChannelMessage: function(msg) {
        if (typeof(msg) == "undefined" || msg == null)
            return;
        
		// block message
		if (msg.length > 8 && msg[4] == 0x01) {
			var blk = null;
			var sKey = ((msg[6] & 0xff) << 8) | (msg[7] & 0xff);
			var ret = 0;
//			trace("parse blk:"+msg.slice(0, 8));
			if (msg[5] == 0x1f) {		// first block messgae
				blk = new icetech.BlockData(this.ipushutil);
				ret = blk.setChanFirst(sKey, msg, 0, msg.length-2);
//				trace("set new blkmsg: key("+sKey+") ret:"+ret);
				if (ret == 0) {
					var tmp = blkHashPut(blk);
					if (tmp != null) {		// this sKey already exist, delete it
						delete tmp;
						this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_CHANNEL_ERR, message:"Incomplete message is replaced by a later message with same ID"});
					}
				}
			} else {			// continue block messsage
				blk = blkHashGet(sKey);
//				trace("recv cont. blkmsg: key("+sKey+") found block:"+blk);
				if (blk != null) {
					ret = blk.setChanBlock(msg, 0, msg.length-2);
//					trace("set cont. blkmsg: ret:"+ret);
					if (ret != 0) {
						blkHashRemove(sKey);
					}
				} else {
						this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_COMBINE_ERR, message:"Received unknown block message error"});
				}
			}
			if (ret > 0) {
				if (blk != null) {
                    this.dispatchEvent({type:"channel", channel:icetech.iPushUtil.joinString(blk.channel), data:blk.data, length:blk.data.length});
				}
			} else if (ret < 0) {
				this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_COMBINE_ERR, message:"Receiving channel large size message error ("+ret+")"});
			}
			return;
		}

		// single channel message
		var chan = msg.slice(0, 4);
		var body = msg.slice(4, -2);
		if (body.length <= 0) {
			return;
		}
		if (this.ipushcmt.packChannelData) {
			body = this.ipushutil.dataUnpack(body);
		}
		this.dispatchEvent({type:"channel", channel:icetech.iPushUtil.joinString(chan), data:body, length:body.length});
    },
    
	// Parse JMS messages
	parseJMSSubjectMessage: function(msg) {
		if ((msg[4] & 0x40) != 0)		// Persistent Message
			this.sendAckMessage(msg);
		var jms = new icetech.BlockData(this.ipushutil);
		if (jms.setJMSData(msg, 0, msg.length - 2) == 1) {
			this.dispatchEvent({type:"subject", subject:jms.name, durname:jms.durname, length: jms.size, data:jms.data, msgid:jms.MsgID, cid:jms.CID});
		} else {
			this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_JMS_ERR, message:"Receiveing JMS message error"});
		}
		jms = null;
	},
	
	/**
	 *  Process Subject message.
	 *
	 *  Client Header:
	 *       [code][key][total-length][0x01]
	 *  size   1   2		n		 1
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 */
	parseSubjectMessage: function(msg) {
		var bData = null;
		var ret = 0;
		if ((msg[4] & 0x40) != 0) {		// persistent message
			this.sendAckMessage(msg);
		}
		var nName = (msg[19] & 0xff) - 0x20;
		var nDest = (msg[20] & 0xff) - 0x20;
		var pBody = 22 + nName + nDest;
		var sKey = ((msg[2] & 0x1f) << 24) | ((msg[3] & 0xff) << 16) | ((msg[pBody + 1] & 0xff) << 8) | (msg[pBody + 2] & 0xff);

//		trace("parse blk:"+buf.slice(0, 8));
		if (msg[pBody] == 0x1f) {		// First Block
			bData = new icetech.BlockData(this.ipushutil);
			ret = bData.setSubjFirst(sKey, msg, 0, msg.length - 2);
//			trace("set new blkmsg: key("+sKey+") ret:"+ret);
			if (ret == 0) {		// Waiting for next block
				var lastData = this.blkHashPut(bData);
				if (lastData != null) {
					delete lastData;
					this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_SUBJECT_ERR, message:"Incomplete message is replaced by a later message with same ID"});
				}
			}
		} else {		// Following blocks
			bData = this.blkHashGet(sKey);
//			trace("recv cont. blkmsg: key("+sKey+") found block:"+bData);
			if (bData != null) {
				ret = bData.setSubjBlock(msg, 0, msg.length - 2);
//				trace("set cont. blkmsg: ret:"+ret);
				if (ret != 0) {		// Message complete/error
					this.blkHashRemove(sKey);
				}
			} else {
				this.dispatchEvent({type:"status", code:iPushUtil.MSG_COMBINE_ERR, message:"Received unknown block message error"});
			}
		}

		if (ret > 0) {			// Message complete
			if (bData != null) {
				this.dispatchEvent({type:"subject", subject:bData.name, durname:bData.durname, length: bData.size, data:bData.data, msgid:bData.MsgID, cid:bData.CID});
			}
		} else if (ret  < 0) {	// Message error
			if (bData != null)
				this.dispatchEvent({type:"status", code:icetech.iPushUtil.MSG_SUBJECT_ERR, message:"Receiveing subject message error ("+ret+")"});
		}
	},

	descrambleData: function(buf, off, len, givenkey) {
		var key;
        if (typeof(givenkey) == "number")
            key = givenkey+len+(buf[off+1] & 0xff);
        else
            key = this.nSectionKey+len+(buf[off+1] & 0xff);
					
		var n;
		// Subject message (start with '%' and length > 21)
		if ((buf[off] == 0x25) && (len>21)) {
			// Decode to DestLen
			for (n=3; n<21; n++) {
				var ch = buf[off+n];
				var nch = (ch ^ key) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = ch=nch;
				}
				key = ((key*17)+(ch & 0xff)) & 0xff;
			}
			var DestLen = (buf[off+19] & 0xff)+(buf[off+20] & 0xff)-(0x20*2);
			// Decode  Destination
			for (n=21; n<21+DestLen+1; n++) {
				var ch = buf[off+n];
				var nch = (ch ^ key) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = ch=nch;
				}
				key = ((key*17)+(ch & 0xff)) & 0xff;
			}
			// Check checksum value
			var chsum = 0;
			for (n=3; n<21+DestLen+1; n++) {
				chsum ^= buf[off+n];
			}
			// trace("chsum="+chsum);
			if (chsum != 0 && chsum != 0x20) {
				return icetech.iPushUtil.MSG_DECODE_ERR;
			}
			// Decode message body
			// Get scramble code
			var prebyte = buf[off+5];	//PreByte
			var s0 = (buf[off+6]-((prebyte & 0x08) == 0x08 ? 0x20 : 0));
			var s1 = (buf[off+7]-((prebyte & 0x04) == 0x04 ? 0x20 : 0));
			var s2 = (buf[off+8]-((prebyte & 0x02) == 0x02 ? 0x20 : 0));
			var s3 = (buf[off+9]-((prebyte & 0x01) == 0x01 ? 0x20 : 0));
			var sid = s3*16777216+s2*65536+s1*256+s0;
			for (n=21+DestLen+1; n<len; n++) {		// Decode body
				var ch = buf[off+n];
				var nch = (ch ^ sid) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = ch=nch;
				}
				sid = ((sid*99)+(ch & 0xff)) & 0xff;
			}
			return len;
		} else {
			// Decode command
			for (n=len-1; n>=3; n--) {
				var ch = buf[off+n];
				var nch = (ch ^ key) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = ch = nch;
				}
				key = ((key*17)+(ch & 0xff)) & 0xff;
			}
			// iPush message, no checksum
			return len;
		}
	},

	scrambleData: function(buf, off, len, givenkey) {
		var key;
        if (typeof(givenkey) == "number")
            key = givenkey+len+(buf[off+1] & 0xff);
        else
            key = this.nSectionKey+len+(buf[off+1] & 0xff);
		
		var nlen;
		var n;
		if (buf[off] == 0x25 && len>21) {
			var prebyte = buf[off+5];
			var s0 = (buf[off+6]-((prebyte & 0x08) == 0x08 ? 0x20 : 0));
			var s1 = (buf[off+7]-((prebyte & 0x04) == 0x04 ? 0x20 : 0));
			var s2 = (buf[off+8]-((prebyte & 0x02) == 0x02 ? 0x20 : 0));
			var s3 = (buf[off+9]-((prebyte & 0x01) == 0x01 ? 0x20 : 0));
			var sid = (s3*16777216+s2*65536+s1*256+s0) & 0xff;
			nlen = (buf[off+20] & 0xff) - 0x20 + 21;
			var chsum = 0;
			var ch, nch;
			for (n=3; n<nlen; n++) {
				ch = buf[off+n];
				chsum = (chsum ^ ch) & 0xff;
				//checksum
				nch = (ch ^ key) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = nch;
				}
				key = ((key*17)+(ch & 0xff)) & 0xff;
			}
			ch = chsum | 0x20;
			nch = (ch ^ key) & 0xff;

			if (ch != 0x0A && nch != 0 && nch != 0x0A) {
				buf[off+nlen] = nch;
			} else {
				buf[off+nlen] = ch;
			}

			for (n=nlen+1; n<len; n++) {
				ch = buf[off+n];
				nch = (ch ^ sid) & 0xff;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[off+n] = nch;
				}
				sid = ((sid*99)+(ch & 0xff)) & 0xff;
			}
			return len;
		} else {
            // Encode command
			nlen = len;

			var chsum = 0;
			for (n=nlen-1; n>=3; n--) {
				chsum ^= buf[off+n];
			}
			chsum &= 0xff;
			buf[off+nlen] = buf[off+nlen-1];
			buf[off+nlen-1] = chsum | 0x20;

            if (typeof(givenkey) == "number")
                key = (givenkey+nlen+1+(buf[1] & 0xff)) & 0xff;
            else
                key = (this.nSectionKey+nlen+1+(buf[1] & 0xff)) & 0xff;
			
			for (n=nlen; n>=3; n--) {
				var ch = buf[n];
				var nch = ch ^ key;
				if (ch != 0x0A && nch != 0 && nch != 0x0A) {
					buf[n] = nch;
				}
				key = ((key*17)+(ch & 0xff)) & 0xff;
			}
			return nlen+1;
		}
	},

	descrambleString: function(strText, givenkey) {
		var arData = new Array();
		for (var i = 0; i<strText.length; i++) {
			arData[i] = strText.charCodeAt(i) & 0xff;
		}
		var nLen = this.descrambleData(arData, 0, strText.length, givenkey);
		strText = "";
		for (i=0; i<nLen; i++) {
			strText += String.fromCharCode(arData[i]);
		}
		return strText;
	},

    scrambleString: function(strText, givenkey) {
        var arData = new Array();
        for (var i = 0; i<strText.length; i++) {
            arData[i] = strText.charCodeAt(i) & 0xff;
        }
        var nLen = this.scrambleData(arData, 0, strText.length, givenkey);
        strText = "";
        for (i=0; i<nLen; i++) {
            strText += String.fromCharCode(arData[i]);
        }
        return strText;
    },
    
	// send Channel message with String argument type
    sendChannelString: function(channel, msg) {
		if (!this.bLoginOK) {
			this.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
			return icetech.iPushUtil.CONNECTION_UNREADY;
		}
		if (msg == null || msg.length <= 0)
			return -1;
        var arMsg = this.ipushutil.String2UTF8(msg);
		return this.sendChannelData(channel, arMsg);
	},

	// Send message with specified channel to iPush server.
	sendChannelData: function(channel, msg) {
		if (!this.bLoginOK) {
            this.ipushconn.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
            return icetech.iPushUtil.CONNECTION_UNREADY;
		}
		var chstr = this.ipushutil.getChannelBytes(channel);
		if (chstr == null || msg == null || msg.length <= 0) {
			return -1;
		}
		
		// single message mode
		if (msg.length < icetech.iPushUtil.DEFAULT_CHANNEL_PKT_SIZE) {
			if (this.ipushcmt.packChannelData) {
				msg = this.ipushutil.dataPack(msg);
			}
			//this.sendToiPush(chstr + icetech.iPushUtil.joinString(msg) + "\r\n");
            this.ipushcmt.enqueueChannelData(channel, chstr + icetech.iPushUtil.joinString(msg) + "\r\n");
            if (this.ipushcmt.reqQueue.length == 1)
                this.ipushcmt.netWorker();			
			return msg.length;
		} 
		// block msg mode
        //return this.sendBlockChannelData(chstr, msg);
		return this.enqueueBlockChannelData(channel, msg);
	},

	// send subject message with ASCII String argument type
	sendSubjectString: function(subject, msg, priority, qos, mode, protocol, ttl) {
		if (!this.bLoginOK) {
			this.dispatchEvent({type:"status", code:icetech.iPushUtil.CONNECTION_UNREADY, message:"Conneciton not ready"});
			return icetech.iPushUtil.CONNECTION_UNREADY;
		}
		if (typeof(subject) != "string" || subject == null || subject.length <= 0 || subject.length > icetech.iPushUtil.MAX_SUBJECT_NAME) {
			return icetech.iPushUtil.INVALID_SUBJECT;
		}
		if (typeof(msg) != "string" || msg == null || msg.length <= 0) {
			return icetech.iPushUtil.INVALID_DATA;
		}
		var arMsg = this.ipushutil.String2UTF8(msg);
		return this.sendSubjectData(subject, arMsg, priority, qos, mode, protocol, ttl);
	},

	nextBlkID: function() {
		var blkid = this.nLastBlkID;
		while (blkid == this.nLastBlkID) {
			blkid = Math.floor((Math.random() * 0xffff)) | 0x2020;
		}
		this.nLastBlkID = blkid;
		return this.nLastBlkID;
	},

	// Set message header for sending
	setMesgHeader: function(buf, subject, priority, qos, mode, protocol, ttl) {
		buf[0] = 0x25;		// '%'
		buf[1] = 0x20 + ((qos&3) << 6);	// QJT: QOS:2, "1", JMS:2, Type:4
		buf[2] = 0xb0;		// CID_1: S&F:1, Reserved:1, "1", ~bit6:1, CID_High:4
		buf[3] = 0x20;		// CID_2: CID_Low:8
		buf[4] = (mode == icetech.iPushUtil.PERSISTENT ? 0x60 : 0x20) | (priority & 0x0f);	// DRP
		// buf[5 ~ 9]: Security - set while sending
		var prebits = this.ipushutil.encodePreValue(buf, 10, ttl);	// TTL
		buf[14]  = ((prebits << 4) & 0xff) | 0x20;
		buf[4] |= ((prebits & 2) << 6) & 0xff;
		// buf[15 ~ 18]: MsgID - set while sending

		if (protocol == icetech.iPushUtil.QUEUE)
			subject = "%Q" + subject;
		buf[19] = 0x20;						// NameLen - empty
		buf[20] = 0x20 + subject.length;	// DestLen
		for (var i = 0; i < subject.length; i++)
			buf[21+i] = subject.charCodeAt(i);
		buf[21+subject.length] = 0x20;	// checksum
		return buf.length;
	},

	// Set body encoding key and msgid
    setMesgSecurity: function(buf, msgid) {
		var secid = Math.random(0xffffffff);
		var presec = this.ipushutil.encodePreValue(buf, 6, secid);
		buf[5] = 0x20 | presec;
		var prebits = this.ipushutil.encodePreValue(buf, 15, msgid);
		buf[14] = (buf[14] & 0xf0) | prebits;
		return secid;
	},

	// Set client (body) header
    setClientHeader: function(buf, pos, totallen) {
		var blkid = this.nextBlkID();
		buf[pos++] = 0x1f;		// First block code
		buf[pos++] = blkid & 0xff;	// Block ID
		buf[pos++] = (blkid >> 8) & 0xff;		// Block ID
		var lenstr = totallen.toString();
		for (var i = 0; i < lenstr.length; i++)
			buf[pos++] = lenstr.charCodeAt(i);
		buf[pos++] = 0x01;
		return pos;
	},
    
	// set channel header for block message
	setChanHeader: function(buf, pos, bname, totallen) {
		buf[pos++] = 0x01;		// magic number
		buf[pos++] = 0x1f;		// code - first block message
		var blkid = this.nextBlkID();
		buf[pos++] = blkid & 0xff;	// Block ID
		buf[pos++] = (blkid >> 8) & 0xff;		// Block ID
		for (var i = 0; i < bname.length; i++)		// Block name
			buf[pos++] = bname.charCodeAt(i);
		buf[pos++] = 0x01;		// separator
		var lenstr = totallen.toString();
		for (var i = 0; i < lenstr.length; i++)	// Block message length
			buf[pos++] = lenstr.charCodeAt(i);
		buf[pos++] = 0x01;
		return pos;
	},

	/**
	 *  Send Ack Message - persistent message.
	 *
	 *  Ack Message Format
	 *		"x$ja"[PreByte][MsgID*4][NameLen][DestLen][Name][Dest]"\r\n"
	 *
	 *  @param buf Message to parse.
	 *  @param off Starting index.
	 *  @param len Message length.
	 */
	sendAckMessage: function(buf) {
		var nName = (buf[19] & 0xff) - 0x20;
		var nDest = (buf[20] & 0xff) - 0x20;
		var nLen = 7 + nName + nDest;
		var msg = "x$ja";

		for (var i=0; i<nLen; i++) {
			msg += String.fromCharCode(buf[14+i]);
		}
		msg += "\r\n";
		//this.sendScrambleMessage(msg);
		this.ipushcmt.enqueueMessage(this.scrambleString(msg));
	},

	blkHashPut: function(blk) {
		var tmp;
		
		if (blk == null)
			return null;
		if (this.aBlkHash.length >= this.BLK_HASH_SIZE)
			return null;
		for (var i=0; i<this.aBlkHash.length; i++) {
			if (this.aBlkHash[i].sKey == blk.sKey) {
				tmp = this.aBlkHash[i];
				this.aBlkHash[i] = blk;
				return tmp;
			}
		}
		this.aBlkHash.push(blk);
//		trace("blkHash size:"+aBlkHash.length);
		return null;
	},
	
	blkHashGet: function(sKey) {
		for (var i=0; i<this.aBlkHash.length; i++) {
			if (this.aBlkHash[i].sKey == sKey) {
				return this.aBlkHash[i];
			}
		}
		return null;
	},
	
	blkHashRemove: function(sKey) {
		for (var i=0; i<this.aBlkHash.length; i++) {
			if (this.aBlkHash[i].sKey == sKey) {
				var tmp = this.aBlkHash.splice(i, 1);
				delete tmp;
				return true;
			}
		}
//		trace("blkHash size:"+aBlkHash.length);
		return false;
	}	
}

var iPushConn = icetech.iPushConn;
module.exports = iPushConn;


