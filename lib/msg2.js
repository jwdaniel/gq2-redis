function MSG2(slen, vlen) {
	this.mcode = 0;
	this.str = [];
	this.val = [];
}

/**
 * 取得 MSG 版本
 * @param  {Number} checksum 檢核碼
 * @return {String} version
 */
MSG2.prototype.getVersion = function(checksum) {
	// checksum = 0 (MSG2), checksum = 0x0f (MSG2.1)
	// 因為以前 推手 沒有驗 checksum，引此這邊只針對 checksum 是 0x0f 做另外處理。
	var version = '2.0';
	// checksum = 0x0f (MSG2.1)
	if (checksum === 0x0f) {
		version = '2.1';
	}
	return version;
};
/**
 * 取得檢核碼
 * @param  {String|Array<Byte>} datas 資料
 * @param  {Number} [position=0] 起始位置
 * @return {Number} 檢核碼
 */
MSG2.prototype.getCheckSum = function(datas, position) {
	if (typeof position !== 'number') {
		p = 0;
	}

	var byteArray = datas;

	// 如果是字串要轉為 byte array
	if (typeof datas === 'string') {
		byteArray = [];
		[].forEach.call(datas, function(ch) {
			byteArray.push(ch.charCodeAt(0));
		});
	}

	var max = position + byteArray.length - 1;
	var checksum = this.parseCheckSum(byteArray, position + 1, byteArray.length - 2);
	checksum = checksum ^ byteArray[max];

	return checksum;
};

MSG2.prototype.toString = function() {
	var strMap = this.str.reduce(function(value, element, index) {
		value[index] = element;
		return value;
	}, {});
	var valMap = this.val.reduce(function(value, element, index) {
		value[index] = element;
		return value;
	}, {});
	return JSON.stringify({
		mcode: this.mcode,
		str: strMap,
		val: valMap
	});
};
MSG2.prototype.clone = function(msg) {
	var len = msg.str.length;
	for (var i = 0; i < len; i++) {
		if (msg.str[i] != null)
			this.str[i] = msg.str[i];
	}
	len = msg.val.length;
	for (var i = 0; i < len; i++) {
		if (msg.val[i] != null)
			this.val[i] = msg.val[i];
	}
};

/*************************************************************************************************************
 * parse msg2
 *************************************************************************************************************/
MSG2.prototype.parseCheckSum = function(buffer, position, length) {
	var sum = 0;
	var max = position + length;

	while(position < max) {
		sum += buffer[position++] & 0x7f;
	}

	return this.packByte(sum & 0x7f);
};

MSG2.prototype.parse = function(line, p) {
	var id, len;
	if (!p) {
		p = 0;
	}

	var checksum = this.getCheckSum(line, p);
	var version = this.getVersion(checksum);

	this.mcode = line.charCodeAt(p);
	var max = line.length - 1;
	var pos = p + 1;
	while (pos < max) {
		var ch = line.charCodeAt(pos++);
		if (ch >= 0x90) {
			if (ch >= 0xc0) {
				id = (ch - 0xc0) >> 4;
				len = (ch & 0x0f);
			} else if (ch >= 0xa0) {
				id = (ch - 0xa0);
				len = line.charCodeAt(pos++) - 0x20;
			} else {
				id = (ch - 0x90) * 224 + line.charCodeAt(pos++) - 0x20;
				var hlen = line.charCodeAt(pos++) - 0x20;
				len = hlen * 224 + line.charCodeAt(pos++) - 0x20;
			}
			this.str[id] = Utf8.decode(line.substr(pos, len));
			if (len < 0) return;
			pos += len;
		} else {
			if (ch >= 0x80) {
				id = (ch - 0x80) * 224 + line.charCodeAt(pos++) - 0x20;
			} else {
				id = (ch - 0x20);
			}
			ch = line.charCodeAt(pos++);
			if (ch < 0x60) {
				val = ch - 0x20;
			} else if (ch < 0xa0) {
				val = ch & 0x0f;
				switch (ch >> 4) {
					case 9:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 8:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 7:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 6:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
				}
			} else if (ch < 0xc0) {
				val = -(ch & 0x1f);
			} else {
				val = -(ch & 0x0f);
				switch (ch >> 4) {
					case 15:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 14:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 13:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 12:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
				}
			}

			this.val[id] = this.parseBase10(val, version);
		}
	}
};

MSG2.prototype.parseByte = function(data, p, keepByte) {
	var id, val;
	if (!p) {
		p = 0;
	}
	this.mcode = data[p];

	var checksum = this.getCheckSum(data, p);
	var version = this.getVersion(checksum);

	var max = p + data.length - 1;
	var pos = p + 1;
	while (pos < max) {
		var ch = data[pos++] & 0xff;

		// text
		if (ch >= 0x90) {
			if (ch >= 0xc0) {
				id = (ch - 0xc0) >> 4;
				len = (ch & 0x0f);
			} else if (ch >= 0xa0) {
				id = (ch - 0xa0);
				len = (data[pos++] & 0xff) - 0x20;
			} else {
				id = (ch - 0x90) * 224 + (data[pos++] & 0xff) - 0x20;
				var hlen = (data[pos++] & 0xff) - 0x20;
				len = hlen * 224 + (data[pos++] & 0xff) - 0x20;
			}

			if (keepByte) {
				this.str[id] = data.slice(pos, pos + len);
			} else {
				this.str[id] = Utf8.decodeByte(data, pos, len);
			}

			if (len < 0) {
				return;
			}
			pos += len;
		}

		// value
		if (ch < 0x90) {
			if (ch >= 0x80) {
				id = (ch - 0x80) * 224 + (data[pos++] & 0xff) - 0x20;
			} else {
				id = (ch - 0x20);
			}
			ch = (data[pos++] & 0xff);
			if (ch < 0x60) {
				val = ch - 0x20;
			} else if (ch < 0xa0) {
				val = ch & 0x0f;
				switch (ch >> 4) {
					case 9:
						val = val * 224 + data[pos++] - 0x20;
						val = val * 224 + data[pos++] - 0x20;
						val = val * 224 + data[pos++] - 0x20;
						val = val * 224 + data[pos++] - 0x20;
					case 8:
						val = val * 224 + data[pos++] - 0x20;
						val = val * 224 + data[pos++] - 0x20;
					case 7:
						val = val * 224 + data[pos++] - 0x20;
					case 6:
						val = val * 224 + data[pos++] - 0x20;
				}
			} else if (ch < 0xc0) {
				val = -(ch & 0x1f);
			} else {
				val = -(ch & 0x0f);
				switch (ch >> 4) {
					case 15:
						val = val * 224 - data[pos++] + 0x20;
						val = val * 224 - data[pos++] + 0x20;
						val = val * 224 - data[pos++] + 0x20;
						val = val * 224 - data[pos++] + 0x20;
					case 14:
						val = val * 224 - data[pos++] + 0x20;
						val = val * 224 - data[pos++] + 0x20;
					case 13:
						val = val * 224 - data[pos++] + 0x20;
					case 12:
						val = val * 224 - data[pos++] + 0x20;
				}
			}

			this.val[id] = this.parseBase10(val, version);
		}
	}

};

MSG2.prototype.parseWithoutUTF8Decode = function(line, p) {
	var id, val;
	if (!p) {
		p = 0;
	}
	this.mcode = line.charCodeAt(p);

	var checksum = this.getCheckSum(line, p);
	var version = this.getVersion(checksum);

	var max = line.length - 1;
	var pos = p + 1;
	while (pos < max) {
		var ch = line.charCodeAt(pos++);
		if (ch >= 0x90) {
			if (ch >= 0xc0) {
				id = (ch - 0xc0) >> 4;
				len = (ch & 0x0f);
			} else if (ch >= 0xa0) {
				id = (ch - 0xa0);
				len = line.charCodeAt(pos++) - 0x20;
			} else {
				id = (ch - 0x90) * 224 + line.charCodeAt(pos++) - 0x20;
				var hlen = line.charCodeAt(pos++) - 0x20;
				len = hlen * 224 + line.charCodeAt(pos++) - 0x20;
			}
			//			if (id < this.str.length)
			//				this.str[id] = Utf8.decode(line.substr(pos, len));
			this.str[id] = line.substr(pos, len);

			if (len < 0) return;
			pos += len;
		} else {
			if (ch >= 0x80) {
				id = (ch - 0x80) * 224 + line.charCodeAt(pos++) - 0x20;
			} else {
				id = (ch - 0x20);
			}
			ch = line.charCodeAt(pos++);
			if (ch < 0x60) {
				val = ch - 0x20;
			} else if (ch < 0xa0) {
				val = ch & 0x0f;
				switch (ch >> 4) {
					case 9:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 8:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 7:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
					case 6:
						val = val * 224 + line.charCodeAt(pos++) - 0x20;
				}
			} else if (ch < 0xc0) {
				val = -(ch & 0x1f);
			} else {
				val = -(ch & 0x0f);
				switch (ch >> 4) {
					case 15:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 14:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 13:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
					case 12:
						val = val * 224 - line.charCodeAt(pos++) + 0x20;
				}
			}

			this.val[id] = this.parseBase10(val, version);
		}
	}
};

/**
 * 計算 value 資料
 */
MSG2.prototype.parseBase10 = (function () {
	// MSG2.1 value 進位對應表
	this.valBase10 = [
		1,
		10,
		100,
		1000,
		10000,
		100000,
		1000000,
		10000000
	];

	return function(value, version) {
		var val = value;
		switch (version) {
			case '2.1':
				if (value < 0) {
					val =  parseInt(value / 8, 10) * valBase10[-value & 0x07];
				} else {
					val = parseInt(value / 8, 10) * valBase10[value & 0x07];
				}
				break;
		}
		return val;
	};
})();


/*************************************************************************************************************
 * create msg2
 *************************************************************************************************************/
MSG2.prototype.createMsgLine = function(mcode) {
	this.buf = [mcode];
	for (var n = 0; n < this.str.length; n++) {
		if (this.str[n] != null)
			this.addMsgRaw(n, Utf8.encode(this.str[n]));
	}

	for (var n = 0; n < this.val.length; n++) {
		if (this.val[n] != null)
			this.addMsgVal(n, this.val[n]);
	}
	this.buf.push(this.packCheckSum(1));
	return this.buf;
};

MSG2.prototype.addMsgRaw = function(id, data) {
	var len = data.length;
	if (id < 4 && len < 16) {
		this.buf.push(0xc0 + id * 0x10 + len);
	} else if (id < 32 && len < 224) {
		this.buf.push(0xa0 + id);
		this.buf.push(0x20 + len);
	} else {
		this.addInt224(2, 0x90, id);
		this.buf.push(0x20 + parseInt(len / 224));
		this.buf.push(0x20 + len % 224);
	}
	for (var i = 0; i < data.length; i++)
		this.buf.push(data.charCodeAt(i));
};

MSG2.prototype.addMsgVal = function(id, val) {
	if (id < 96) {
		this.buf.push(0x20 + id);
	} else {
		this.addInt224(2, 0x80, id);
	}
	if (val < 0) {
		val = -val;
		if (val <= 32 - 1)
			this.addInt224(1, 0xa0, val);
		else if (val <= 16 * 224 - 1)
			this.addInt224(2, 0xc0, val);
		else if (val <= 16 * 224 * 224 - 1)
			this.addInt224(3, 0xd0, val);
		else if (val <= 16 * 224 * 224 * 224 * 224 - 1)
			this.addInt224(5, 0xe0, val);
		else
			this.addInt224(9, 0xf0, val);
	} else {
		if (val <= 64 - 1)
			this.addInt224(1, 0x20, val);
		else if (val <= 16 * 224 - 1)
			this.addInt224(2, 0x60, val);
		else if (val <= 16 * 224 * 224 - 1)
			this.addInt224(3, 0x70, val);
		else if (val <= 16 * 224 * 224 * 224 * 224 - 1)
			this.addInt224(5, 0x80, val);
		else
			this.addInt224(9, 0x90, val);
	}
};

MSG2.prototype.addInt224 = function(len, code, val) {
	var nPos = this.buf.length;
	for (var n = nPos + len - 1; n > nPos; n--) {
		this.buf[n] = (0x20 + val % 224);
		val = parseInt(val / 224);
	}
	this.buf[nPos] = (code + val);
};

MSG2.prototype.packCheckSum = function(pos) {
	var sum = 0;
	var max = pos + this.buf.length;

	while (pos < max) {
		sum += this.buf[pos++] & 0x7f;
	}
	return this.packByte(sum & 0x7f);
};

MSG2.prototype.packByte = function(val) {
	if (val >= 0 && val < 0x80) {
		return (val < 0x40 ? val + 0x30 : val + 0x70);
	} else {
		return '!';
	}
};

MSG2.prototype.isEqual = function(msg, ignoreList) {
	var index;
	ignoreList = ignoreList || {
		val: [],
		str: []
	};
	ignoreVal = ignoreList.val || [];
	ignoreStr = ignoreList.str || [];
	for (index in this.val) {
		if (ignoreVal.indexOf(index) !== -1) continue;
		if (this.val[index] != msg.val[index]) {
			console.debug('Different at val', index);
			return false;
		}
	}

	for (index in this.str) {
		if (ignoreStr.indexOf(index) !== -1) continue;
		if (this.str[index] != msg.str[index]) {
			console.debug('Different at str', index);
			return false;
		}
	}

	return true;
};

/*************************************************************************************************************
 *  UTF-8 data encode / decode
 *  http://www.webtoolkit.info/
 *************************************************************************************************************/

var Utf8 = {
	// public method for url encoding
	encode: function(string) {
		string = string.replace(/\r\n/g, "\n");
		var utftext = "";
		var len = string.length;
		for (var n = 0; n < len; n++) {

			var c = string.charCodeAt(n);

			if (c < 128) {
				utftext += String.fromCharCode(c);
			} else if ((c > 127) && (c < 2048)) {
				utftext += String.fromCharCode((c >> 6) | 192);
				utftext += String.fromCharCode((c & 63) | 128);
			} else {
				utftext += String.fromCharCode((c >> 12) | 224);
				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
				utftext += String.fromCharCode((c & 63) | 128);
			}

		}

		return utftext;
	},

	// public method for url decoding
	decode: function(utftext) {
		var string = "";
		var i = 0,
			c = 0,
			c1 = 0,
			c2 = 0;

		while (i < utftext.length) {

			c = utftext.charCodeAt(i);

			if (c < 128) {
				string += String.fromCharCode(c);
				i++;
			} else if ((c > 191) && (c < 224)) {
				c2 = utftext.charCodeAt(i + 1);
				string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
				i += 2;
			} else {
				c2 = utftext.charCodeAt(i + 1);
				c3 = utftext.charCodeAt(i + 2);
				string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
				i += 3;
			}

		}

		return string;
	},

	// public method for url decoding
	decodeByte: function(data, pos, len) {
		var string = '';
		var i = pos;
		var c, c1, c2;
		c = c1 = c2 = 0;
		while (i < pos + len) {
			c = data[i] & 0xff;
			if (c < 128) {
				string += String.fromCharCode(c);
				i++;
			} else if ((c > 191) && (c < 224)) {
				c2 = data[i + 1];
				string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
				i += 2;
			} else {
				c2 = data[i + 1];
				c3 = data[i + 2];
				string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
				i += 3;
			}

		}

		return string;
	}
};

module.exports = MSG2;

