var icetech = {};

icetech.BlockData = function(iputil) {
    this.ipushutil = iputil;
}

icetech.BlockData.prototype = {
    ipushutil:      null,
    sKey:           -1,
    channel:        [],
    name:           null,
    durname:        null,
    data:           [],
    size:           0,
    datalen:        0,
    nextcode:       -1,
    CID:            0,
    MsgID:          0,
    lastUpdate:     0,

	/**
	 *  Parse first block of Channel Message into BlockData.
	 *
	 *  Channel Header
	 *       [chan][0x01][0x1f][BlkID][BlkName][0x01][BlkSize][0x01]
	 *  size     4     1     1      2        n     1        m     1
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 *  @return 1 - Received all block messages.
	 *  @return 2 - Received error.
	 *  @return 0 - Otherwise.
	 */
	setChanFirst: function(key, msg, pos, len) {
		if (msg == null || len < 4) {
			return -1;
		}
		sKey = key;
		channel = msg.slice(pos, pos+4);
        var i = msg.indexOf(0x01, pos+8);
		if (i < 0 || i >= (pos+len)) {
			return icetech.iPushUtil.MSG_BLK_NAME_NA;
		}
		name = icetech.iPushUtil.joinString(msg, pos+8, i-pos-8);
        var j = msg.indexOf(0x01, i+1);
		if (j < 0 || j >= (pos+len)) {
			return icetech.iPushUtil.MSG_BLK_SIZE_NA;
		}
		this.size = parseInt(icetech.iPushUtil.joinString(msg, i + 1, j - i - 1));
		if (this.size <= 0) {
			return icetech.iPushUtil.INVALID_DATA_LEN;
		}
		this.data = new Array;
		this.datalen = this.ipushutil.unpackBlock(this.data, 0, msg, j+1, pos+len-j-1);
		this.nextcode = 0x20;
		var date = new Date();
		this.lastUpdate = date.getTime();
		if (this.datalen >= this.size)
			return 1;
		return 0;
	},

	/**
	 *  Parse Channel Message. (Secondary)
	 *
	 *  Channel Header
	 *       [chan][0x01][0x1f][BlkID]
	 *  size     4     1     1      2
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 *  @return 1 - Received all block messages.
	 *  @return 2 - Received error.
	 *  @return 0 - Otherwise
	 */
	setChanBlock: function(msg, pos, len) {
		if (msg == null || msg.length < 4) {
			return -1;
		}
		if (icetech.iPushUtil.joinString(msg, pos, 4) != icetech.iPushUtil.joinString(channel, 0, 4)) {
			return icetech.iPushUtil.MSG_CH_UNMATCH;
		}
		if (msg[pos+5] != this.nextcode) {
			//trace("mismatch nextcode:"+msg[pos+5]+" != "+nextcode);
			return icetech.iPushUtil.MSG_CODE_UNMATCH;
		}
		this.datalen += this.ipushutil.unpackBlock(this.data, this.datalen, msg, pos+8, len-8);
		this.nextcode++;
		if (this.nextcode > 0xff) {
			this.nextcode = 0x20;
		}
		var date = new Date();
		this.lastUpdate = date.getTime();
		if (this.datalen >= this.size) {
			return 1;
		}
		return 0;
	},

	/**
	 *  Parse JMS Message into BlockData.
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 *  @return 1 - Received all block messages.
	 *  @return 0 - Otherwise
	 */
	setJMSData: function(msg, pos, len) {
		if (msg == null) {
			return -1;
		}
		var durnamelen = (msg[pos + 19] & 0xff) - 0x20;	//durable name length
		if (durnamelen > 0)
			this.durname = icetech.iPushUtil.joinString(msg, pos + 21, durnamelen);	//durable name
		var sublength = (msg[pos + 20] & 0xff) - 0x20;	//subject length
		this.name = icetech.iPushUtil.joinString(msg, pos + 21 + durnamelen, sublength);   //subject
		if (this.name.substr(0, 2) == "%Q")	 {	//Queue message
			this.name = this.name.substr(2);
		}

		var c1 = msg[pos + 2];
		var c0 = msg[pos + 2 + 1];
		this.CID = (c1 & 0x0f) * 0x100 + (c0 & 0xff) - ((c1 & 0x10) << 1);
		this.MsgID = this.ipushutil.decodePreValue(msg.slice(pos+15, pos+19),0,msg[pos+14]);

		var prop = pos + 22 + durnamelen + sublength;	// property position

		var sep = msg.indexOf(0x0d, prop);
		if ((sep < 0) || (sep >= (pos + len)))
			return icetech.iPushUtil.MSG_PROP_NA;		// property is n/a
		var rawsize = pos + len - sep - 3;
		if (rawsize <= 0)
			return icetech.iPushUtil.INVALID_DATA_LEN;
		this.data = new Array();
		this.datalen = this.ipushutil.unpackBlock(this.data, 0, msg, sep + 1, rawsize);
		return 1;
	},
    
	/**
	 *  Parse first block of Subject Message into BlockData.
	 *
	 *  Server Header:
	 *       % [QJT][CID*2][DRP][Sec*5][TTL*4][PreByte][MsgID*4][NameLen][DestLen][Name][Dest][Checksum]
	 *  size 1    1      2    1      5      4        1        4        1        1     m     n         1
	 *  pos  0    1      2    4      5     10       14       15       19       20    21  21+m    21+m+n
	 *
	 *  Modified Server Header:
	 *       % [QJT][TYPE][RESERVED][DRP][Sec*5][CID*4][PreByte][MsgID*4][NameLen][DestLen][Name][Dest][Checksum]
	 *  size 1    1      1    1      1      5       4        1        4        1        1     m     n         1
	 *  pos  0    1      2    3      4      5      10       14       15       19       20    21  21+m    21+m+n
	 *
	 *  client header:
	 *       [code][key][total_length][0x01]
	 *  size     1    2             n     1
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 *  @return 1 - Received all block messages.
	 *  @return 2 - Received error.
	 *  @return 0 - Otherwise
	 */
	setSubjFirst: function(key, msg, pos, len) {
		if (msg == null) {
			return -1;
		}
		this.sKey = key;
		var durnamelen = (msg[pos + 19] & 0xff) - 0x20;	//durable name length
		if (durnamelen > 0)
			this.durname = icetech.iPushUtil.joinString(msg, pos+21, durnamelen);	//durable name
		var sublength = (msg[pos + 20] & 0xff) - 0x20;	//subject length
		this.name = icetech.iPushUtil.joinString(msg, pos+21+durnamelen, sublength);   //subject
		if (this.name.substr(0, 2) == "%Q") {
			this.name = this.name.substr(2);
		}

		if (msg[pos+2] & 0x40) {
		    var cid_preBits = msg[pos+10];
			var server_id = msg[pos+11] & 0xdf;
			var uidx_high = msg[pos+12] & 0xdf;
			var uidx_low  = msg[pos+13] & 0xdf;
			if (cid_preBits & 0x04)
			    server_id |= 0x20;
			if (cid_preBits & 0x02)
			     uidx_high |= 0x20;
			if (cid_preBits & 0x01)
			     uidx_low |= 0x20;
			this.CID = uidx_low + (uidx_high << 8) + (server_id << 16);
		} else {
		var c1 = msg[pos+2];
		var c0 = msg[pos+3];
		this.CID = (c1 & 0x0f) * 0x100 + (c0 & 0xff) - ((c1 & 0x10) << 1);
		}
		this.MsgID = this.ipushutil.decodePreValue(msg.slice(pos+15, pos+19),0,msg[pos+14]);

		var lenindex = pos + 25 + durnamelen + sublength;	// total_length
		var i = msg.indexOf(0x01, lenindex);
		if ((i < 0) || (i >= (pos+len)))
			return icetech.iPushUtil.MSG_SIZE_NA;		// total_length is n/a

		this.size = parseInt(icetech.iPushUtil.joinString(msg, lenindex, i - lenindex));
		if (this.size <= 0)
			return icetech.iPushUtil.INVALID_DATA_LEN;	// Invalid data length

		this.data = new Array();
		this.datalen = this.ipushutil.unpackBlock(this.data, 0, msg, i+1, pos+len-i-3);
		this.nextcode = 0x20;
		var date = new Date();
		this.lastUpdate = date.getTime();
		if (this.datalen >= this.size)
			return 1;
		return 0;
	},

	/**
	 *  Parse Subject message (Secondary).
	 *
	 *  @param msg Message to parse.
	 *  @param pos Starting index.
	 *  @param len Message length.
	 *  @return 1 - Received all block messages.
	 *  @return 2 - Received error.
	 *  @return 0 - Otherwise
	 */
	setSubjBlock: function(msg, pos, len) {
		if (msg == null) {
			return -1;
		}
		var durnamelen = (msg[pos + 19] & 0xff) - 0x20;	//durable name length
		var sublength = (msg[pos + 20] & 0xff) - 0x20;	//subject length
		var tempname = icetech.iPushUtil.joinString(msg, pos + 21 + durnamelen, sublength);   //subject
		if (tempname.substr(0, 2) == "%Q")		//Queue message
			tempname = tempname.substr(2);
		if (tempname != this.name)
			return icetech.iPushUtil.MSG_SBJ_UNMATCH;		// Subject unmatched

		var cpos = pos + 22 + durnamelen + sublength;	// code position
		if (msg[cpos] != this.nextcode) {
			var lastcode = (this.nextcode == 0x20 ? -1 : this.nextcode - 1);
			if (msg[cpos] == this.lastcode)
				return 0;		// redundant packet
			return icetech.iPushUtil.MSG_CODE_UNMATCH;		// invalid nextcode
		}

		this.datalen += this.ipushutil.unpackBlock(this.data, this.datalen, msg, cpos + 3, pos + len - cpos - 5);
		this.nextcode++;
		if (this.nextcode > 0xff)
			this.nextcode = 0x20;
		var date = new Date();
		this.lastUpdate = date.getTime();
		if (this.datalen >= this.size)
			return 1;
		return 0;
	}
}

icetech.iPushUtil = function(ipcmt) {
    this.ipushcmt = ipcmt;

	// ActionScript String <-> UTF8 converter
	var UNI_REPLACEMENT_CHAR		= 0x0000FFFD;
	var UNI_MAX_BMP					= 0x0000FFFF;
	var UNI_MAX_UTF32				= 0x7FFFFFFF;
	var UNI_MAX_LEGAL_UTF32			= 0x0010FFFF;
	var UNI_SUR_HIGH_START			= 0xD800;
	var UNI_SUR_HIGH_END			= 0xDBFF;
	var UNI_SUR_LOW_START			= 0xDC00;
	var UNI_SUR_LOW_END				= 0xDFFF;
	var firstByteMark			    = [ 0x00, 0x00, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC ];
	var trailingBytesForUTF8	    = [	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
										1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
										2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2, 3,3,3,3,3,3,3,3,4,4,4,4,5,5,5,5];
	var offsetsFromUTF8				= [ 0x00000000, 0x00003080, 0x000E2080, 0x03C82080, 0x00FA082080, 0x0082082080 ];

	// convert input String to UTF8 byte array
	this.String2UTF8 = function(source) {
		if (typeof(source) != "string" || source == null || source.length <= 0)
			return null;

		var arTarget = new Array();
		var tpos = 0;
		var bytesToWrite = 0;
		var byteMask = 0xBF;
		var byteMark = 0x80; 
		var ch;
		for (var i=0; i<source.length; i++) {
			ch = source.charCodeAt(i);
			if (ch < 0x80) {
				bytesToWrite = 1;
			} else if (ch < 0x800) {
				bytesToWrite = 2;
			} else if (ch < 0x10000) {
				bytesToWrite = 3;
			} else if (ch <= UNI_MAX_LEGAL_UTF32) {
				bytesToWrite = 4;
			} else {
				bytesToWrite = 3;
				ch = UNI_REPLACEMENT_CHAR;
			}
			//trace(" toutf8 : "+source.charAt(i)+" ("+source.charCodeAt(i).toString(16)+") -> len "+bytesToWrite);
			tpos += bytesToWrite;
			switch (bytesToWrite) {
				case 4:
					tpos--;
					arTarget[tpos] = ((ch | byteMark) & byteMask) & 0xff;
					ch >>= 6;
				case 3:
					tpos--;
					arTarget[tpos] = ((ch | byteMark) & byteMask) & 0xff;
					ch >>= 6;
				case 2:
					tpos--;
					arTarget[tpos] = ((ch | byteMark) & byteMask) & 0xff;
					ch >>= 6;
				case 1:
					tpos--;
					arTarget[tpos] = (ch | firstByteMark[bytesToWrite]) & 0xff;
			}
			tpos += bytesToWrite;
		}
		/*
		trace("converted UTF8:");
		for (var i=0; i<arTarget.length; i++) {
			trace(arTarget[i].toString(16)+", ");
		}
		*/
		return arTarget;
	}
	
	this.isLegalUTF8 = function(source, pos, len) {
		var a;
		var srcptr = pos+len;
		switch (len) {
			default: return false;
			/* Everything else falls through when "true"... */
			case 4: srcptr--; if ((a = (source[srcptr])) < 0x80 || a > 0xBF) return false;
			case 3: srcptr--; if ((a = (source[srcptr])) < 0x80 || a > 0xBF) return false;
			case 2: srcptr--; if ((a = (source[srcptr])) > 0xBF) return false;
		
			switch (source[pos]) {
				/* no fall-through in this inner switch */
				case 0xE0: if (a < 0xA0) return false; break;
				case 0xED: if (a > 0x9F) return false; break;
				case 0xF0: if (a < 0x90) return false; break;
				case 0xF4: if (a > 0x8F) return false; break;
				default:   if (a < 0x80) return false;
			}
		
			case 1: if (source[pos] >= 0x80 && source[pos] < 0xC2) return false;
		}
		if (source[pos] > 0xF4) return false;
		return true;
	}

	// convert input UTF8 byte array to String
	this.UTF82String = function(source) {
		if (typeof(source) == "undefined" || source == null || source.length <= 0)
			return null;

		var target = "";
		var ch = 0;
		var i = 0;
		while (i < source.length) {
			var extraBytesToRead = trailingBytesForUTF8[source[i]];
			/*
			trace("parsing: ("+i+")");
			for (var j=0; j<=extraBytesToRead; j++) {
				trace(source[i+j].toString(16) + ", ");
			}
			*/
			if ((i+extraBytesToRead) >= source.length) {
				break;
			}
			if (!this.isLegalUTF8(source, i, extraBytesToRead+1)) {
				break;
			}
			ch = 0;
			switch (extraBytesToRead) {
				case 5: ch += source[i]; i++; ch <<= 6;
				case 4: ch += source[i]; i++; ch <<= 6;
				case 3: ch += source[i]; i++; ch <<= 6;
				case 2: ch += source[i]; i++; ch <<= 6;
				case 1: ch += source[i]; i++; ch <<= 6;
				case 0: ch += source[i]; i++;
			}
			ch -= offsetsFromUTF8[extraBytesToRead];
			//trace("computed ch:"+ch.toString(16));
			if (ch <= UNI_MAX_LEGAL_UTF32) {
				if (ch >= UNI_SUR_HIGH_START && ch <= UNI_SUR_LOW_END) {
					target += String.fromCharCode(UNI_REPLACEMENT_CHAR);
				} else {
					target += String.fromCharCode(ch);
					//trace("fromutf8 <- "+ch.toString(16)+":"+String.fromCharCode(ch));
				}
			} else {
				target += String.fromCharCode(UNI_REPLACEMENT_CHAR);
			}
		}
		return target;
	}
}

icetech.iPushUtil.prototype = {
    ipushcmt:       null,
    
	toChannelFormat: function(chan) {
		var ch0 = chan.charAt(0);
		if (ch0 == "x") {
			return chan;
		}
		if ((chan.length > 2) && (ch0 == "0")) {
			if (chan.charAt(1) == "x" || chan.charAt(1) == "X") {
				return chan.substr(2);
			}
		}
		return ('"' + chan);
	},
	
	toChannelRange: function(chan) {
		var len = chan.length;
		var ch0 = chan.charAt(0);
		if (ch0 == "x") {
			return chan;
		}
		if ((chan.length > 2) && (ch0 == "0")) {
			if (chan.charAt(1) == "x" || chan.charAt(1) == "X") {
				return chan.substr(len-2);
			}
		}
		return chan.substr(len-1);
	},

    getChannelString: function(channels) {
        if (typeof(channels) == "undefined" || channels == null || channels.length <= 0) {
            return null;
        }
        if (channels.indexOf(" ") >= 0) {
            var list = channels.split(' ');
            channels = list.join(",");
        }
        var list = channels.split(",");
        for (var i = 0; i < list.length; i++) {
            var pos = list[i].indexOf("-");
            if (pos >= 0) {
                list[i] = this.toChannelFormat(list[i].substr(0, pos)) + "-" + this.toChannelRange(list[i].substr(pos+1));
            } else {
                list[i] = this.toChannelFormat(list[i]);
            }
        }
        return list.join(",");
    },

    getChannelBytes: function(channel) {
		if (channel == null || channel.length <= 0) {
			return null;
		}
		// Check invalid channel
		if ((channel.length >= 10) && ((channel.substr(0, 2) == "0x") || (channel.substr(0, 2) == "0X"))) {
			var val = parseInt(channel.substr(2, 8), 16);
			var c1 = (val >> 24) & 0xff;
			var c2 = (val >> 16) & 0xff;
			var c3 = (val >> 8) & 0xff;
			var c4 = (val) & 0xff;
			return String.fromCharCode(c1, c2, c3, c4);
		} else {
			return channel.substr(0, 4);
		}
	},

    dataPack: function(arMsg) {
		if (arMsg == null) {
			return null;
		}
		var destMsg = new Array();
		var ch;
		var bit8 = 0;
		var mask = 1;
		var len = arMsg.length;
		var nLen = 0;
		
		for (var n=0; n < len; n++) {
			ch = arMsg[n] & 0xff;
			if ((ch & 0x80) > 0) {
				bit8 |= mask;
				ch &= 0x7f;
			}
			destMsg[nLen++] = ((ch >= 0x40 ? ch + 0x60 : ch + 0x20) & 0xff);
			mask *= 2;
			if (mask >= 0x80) {
				destMsg[nLen++] = ((bit8 >= 0x40 ? bit8 + 0x60 : bit8 + 0x20) & 0xff);
				bit8 = 0;
				mask = 1;
			}
		}
		if (mask != 1) {
			destMsg[nLen++] = ((bit8 >= 0x40 ? bit8 + 0x60 : bit8 + 0x20) & 0xff);
		}

		return destMsg;
	},

	dataUnpack: function(arMsg) {
		var destMsg = new Array();

		var ch;
		var bit8 = 0;
		var mask = 1;
		var len = arMsg.length;
		var i = 0;
		var j = 0;
		
		while (len > 0) {
			if (mask == 1) {
				ch = arMsg[(len > 8 ? (i + 7) : (i + len -1))];
				bit8 = ((ch >= 0x80 ? ch - 0x60 : ch - 0x20) & 0xff);
				len--;
			}
			ch = arMsg[i] & 0xff;
			i++;
			len--;
			ch = ((ch >= 0x80 ? ch - 0x60 : ch - 0x20) & 0xff);
			if ((bit8 & mask) > 0) {
				destMsg[j] = ch + 0x80;
			} else {
				destMsg[j] = ch;
			}
			j++;
			mask *= 2;
			if (mask >= 0x80) {
				i++;
				mask = 1;
			}
		}

        //alert("unpack: from: "+arMsg+"\nto:"+destMsg);
		return destMsg;
	},
    
	/**
	 *  Pack message.
	 *
	 *  @param dest Destination buffer.
	 *  @param poffsize Destination Starting Index & Buffer Length (int[2])
	 *  @param msg Message to pack.
	 *  @param offmsg Starting index.
	 *  @param len Message length.
	 *  @return Copied-Message length.
	 */
	packBlock: function(dest, poffsize, msg, offmsg, len) {
		var lastpos = -1;		// Last TOGGLE char position
		var currpage = 1;
		var page;
		var mpos  = offmsg;					// Message Starting Index
		var msize = mpos  + len;			// Message Limit (End Position)
		var dpos  = poffsize[0];			// Dest Startint Index
		var dsize = dpos + poffsize[1] - 2;	// Dest Limit (Reserve 2 bytes for next char)
		var ch;

		while ((mpos < msize) && (dpos < dsize)) {
			ch = (msg[mpos] & 0xff);
			mpos++;
			if ((ch >= 0x0a) && (ch <= 0x0e)) {		// page 1
				page = 1;
				ch |= 0x80;
			} else if ((ch >= 0x8a) && (ch <= 0x8e)) {	// page 2
				page = 2;
			} else {
				page = 0;
			}
			if (ch == 0) {					// C_ZERO
				ch = 0x0e;
			} else if (page == 0) {			// normal char
				// do nothing
			} else if (page == currpage) {	// Same page
				lastpos = -1;
			} else if (lastpos != -1) {		// 2 chars in another page
				dest[lastpos] = 0x0c;		// C_TOGGLE
				currpage = page;
				lastpos = -1;
			} else {						// 1 char in another page
				lastpos = dpos;
				dest[dpos++] = 0x0b;		// C_ESCAPE
			}
			dest[dpos++] = ch & 0xff;
		}
		poffsize[0] = dpos;		// Return Position of Destination
		return mpos - offmsg;
	},

	/**
	 *  Unpack message.
	 *
	 *  @param dest Destination buffer.
	 *  @param offdest Destination buffer starting index.
	 *  @param msg Message to pack.
	 *  @param offmsg Starting index.
	 *  @param len Message length.
	 *  @return Copied-Message length.
	 */
	unpackBlock: function(dest, offdest, msg, offmsg, len) {
		var currpage = 1;
		var mpos  = offmsg;				// Message Starting Index
		var msize = mpos  + len;			// Message Limit (End Position)
		var dpos  = offdest;				// Dest Startint Index\
		var ch;

		while (mpos < msize) {
			ch = (msg[mpos] & 0xff);
			mpos++;
			if (ch == 0x0e) {			// C_ZERO
				dest[dpos++] = 0;
			} else if (ch == 0x0b) {	// C_ESCAPE
				ch = (mpos < msize ? (msg[mpos] & 0xff) : 0);
				mpos++;
				if (currpage == 2)		// char in page1
					ch &= 0x7f;
				dest[dpos++] = ch & 0xff;
			} else if (ch == 0x0c) {	// C_TOGGLE
				currpage = 3 - currpage;
			}  else {
				if ((currpage == 1) && (ch >= 0x8a) && (ch <= 0x8e))
					ch &= 0x7f;
				dest[dpos++] =  ch & 0xff;
			}
		}
		return dpos - offdest;
	},

	// Encode value with prebits
	encodePreValue: function(buf, pos, value) {
		var prebits = ((value >> 2) & 8) + ((value >> 11) & 4) + ((value >> 20) & 2) + ((value >> 29) & 1);
		buf[pos++] = 0x20 | (value & 0xff);
		buf[pos++] = 0x20 | ((value >> 8) & 0xff);
		buf[pos++] = 0x20 | ((value >> 16) & 0xff);
		buf[pos++] = 0x20 | ((value >> 24) & 0xff);
		return prebits ^ 0x0f;
	},

	// Decode value with prebits
	decodePreValue: function(buf, pos, prebits) {
		prebits ^= 0x0f;
		var b0 = (buf[pos] & 0xdf) | ((prebits << 2) & 0x20);
		var b1 = (buf[pos+1] & 0xdf) | ((prebits << 3) & 0x20);
		var b2 = (buf[pos+2] & 0xdf) | ((prebits << 4) & 0x20);
		var b3 = (buf[pos+3] & 0xdf) | ((prebits << 5) & 0x20);
        return ((b3*16777216+b2*65536+b1*256+b0) & 0xff);
		//return b0 + (b1 << 8) + (b2 << 16) + (b3 << 24);
	}
}

// Join char array back to ASCII String
icetech.iPushUtil.joinString = function(buf, pos, len) {
    var str = "";
    if (typeof(buf) == "undefined" || buf == null)
        return null;
    if (typeof(pos) == "undefined")
        pos = 0;
    if (typeof(len) == "undefined")
        len = buf.length;
    if (len+pos > buf.length) {
        len = buf.length - pos;
    }
    for (var i = 0; i < len; i++) {
        str += String.fromCharCode(buf[pos+i]);
    }
    return str;
}

icetech.iPushUtil.urlEncode = function(str) {
    var ret = '';
    var pos = 0;
    var srcstr = str.toString();
    var regex = /(^[a-zA-Z0-9_.]*)/;
    while (pos < srcstr.length) {
        var match = regex.exec(srcstr.substr(pos));
        if (match != null && match.length > 1 && match[1] != '') {
          ret += match[1];
          pos += match[1].length;
        } else {
          if (srcstr[pos] == ' ')
            ret += '+';
          else {
            var charCode = srcstr.charCodeAt(pos) & 0xff;
            var hexVal = charCode.toString(16);
            ret += '%' + ( hexVal.length < 2 ? '0' : '' ) + hexVal.toUpperCase();
          }
          pos++;
        }
    }
    return ret;
}

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(elt /*, from*/) {
    var len = this.length;
    var from = Number(arguments[1]) || 0;
    from = (from < 0) ? Math.ceil(from) : Math.floor(from);
    if (from < 0)
      from += len;

    for (; from < len; from++) {
      if (from in this && this[from] === elt)
        return from;
    }
    return -1;
  };
}

var iPushUtil = icetech.iPushUtil;

/*
    byte code mapping from 0x80~0x9F
 */
icetech.iPushUtil.R3Mapping = [8364,129,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,141,381,143,144,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,157,382,376];

icetech.iPushUtil.NON_PERSISTENT		    = 1;
icetech.iPushUtil.PERSISTENT				= 2;
icetech.iPushUtil.TOPIC						= 1;
icetech.iPushUtil.QUEUE						= 2;

icetech.iPushUtil.MAX_SUBJECT_NAME			= 221;
icetech.iPushUtil.BUFFER_MAX				= 8192;
icetech.iPushUtil.MAX_SINGLE_MSG			= 7168;
icetech.iPushUtil.DEFAULT_SUBJECT_PKT_SIZE	= 3072;
icetech.iPushUtil.DEFAULT_CHANNEL_PKT_SIZE  = 1012;

icetech.iPushUtil.CONNECTION_LOST		    = -100;
icetech.iPushUtil.CONNECT_FAILED			= -101;
icetech.iPushUtil.CONNECT_TIMEOUT		    = -102;
icetech.iPushUtil.CONNECTION_UNREADY	    = -103;

icetech.iPushUtil.MSG_COMBINE_ERR		    = -121;
icetech.iPushUtil.MSG_CHANNEL_ERR		    = -122;
icetech.iPushUtil.MSG_SUBJECT_ERR		    = -123;
icetech.iPushUtil.MSG_JMS_ERR				= -124;
icetech.iPushUtil.MSG_DECODE_ERR		    = -125;
icetech.iPushUtil.MSG_ENCODE_ERR		    = -126;
icetech.iPushUtil.MSG_RECV_TIMEOUT	        = -127;

icetech.iPushUtil.MSG_BLK_NAME_NA		    = -130;
icetech.iPushUtil.MSG_BLK_SIZE_NA			= -131;
icetech.iPushUtil.MSG_SIZE_NA				= -132;
icetech.iPushUtil.MSG_PROP_NA				= -133;
icetech.iPushUtil.MSG_CH_UNMATCH	    	= -134;
icetech.iPushUtil.MSG_CODE_UNMATCH	        = -135;
icetech.iPushUtil.MSG_SBJ_UNMATCH		    = -137;
icetech.iPushUtil.ACK_RECV_TIMEOUT		    = -138;

icetech.iPushUtil.INVALID_CHANNEL			= -140;
icetech.iPushUtil.INVALID_SUBJECT			= -141;
icetech.iPushUtil.INVALID_DATA				= -142;
icetech.iPushUtil.INVALID_DATA_LEN			= -143;

icetech.iPushUtil.USER_UNKNOWN			    = -401;
icetech.iPushUtil.NO_SUCH_SERVICE		    = -409;

icetech.iPushUtil.COMET_CMD_FAIL            = -501;

module.exports.BlockData = icetech.BlockData;
module.exports.iPushUtil = icetech.iPushUtil;
