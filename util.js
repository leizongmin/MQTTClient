/**
 * MQTTClient util
 * 
 * @author 老雷<leizongmin@gmail.com>
 * @version 0.1
 * @description for MQTT v3.1
 */

/** MQTT工具类 */
var MQTT = module.exports;

/** 定义消息类型常量 */
MQTT.CONNECT 	= 1;
MQTT.CONNACK 	= 2;
MQTT.PUBLISH 	= 3;
MQTT.PUBACK 		= 4;
MQTT.PUBREC 		= 5;
MQTT.PUBREL 		= 6;
MQTT.PUBCOMP 	= 7;
MQTT.SUBSCRIBE 	= 8;
MQTT.SUBACK 		= 9;
MQTT.UNSUBSCRIBE = 10;
MQTT.UNSUBACK 	=11;
MQTT.PINGREQ 	= 12;
MQTT.PINGRESP 	= 13;
MQTT.DISCONNECT 	= 14;

/**
 * 生成 fixed header
 *
 * @param {int} message_type 消息类型
 * @param {int} dup_flag 
 * @param {int} qos_level 消息等级
 * @param {boolean} retain 是否保留
 * @param {int} remaining_length 剩余内容长度
 * @return {Buffer}
 */
MQTT.fixedHeader = function (message_type, dup_flag, qos_level, retain, remaining_length) {
	// 生成字符串长度字节，此算法来自MQTT v3.1
	var la = [];
	var x = remaining_length;
	var d;
	do {
		d = x % 128;
		x = Math.floor(x / 128);
		if (x > 0)
			d = d | 0x80
		la.push(d);
	} while (x > 0);
	
	var ret = new Buffer(la.length + 1);
	ret[0] = (message_type << 4) + (dup_flag << 3) + (qos_level << 1) + (retain ? 1 : 0);
	for (var i = 1; i < ret.length; i++)
		ret[i] = la[i - 1];
	return ret;
}

/**
 * 连接多个Buffer对象
 *
 * @param {Buffer} buffer_1
 * @param {Buffer} buffer_2
 * @return {Buffer}
 */
MQTT.connect = function () {
	var length = 0;
	for (var i = 0; i < arguments.length; i++)
		length += arguments[i].length;
	var ret = new Buffer(length);

	var cur = 0;
	for (var i = 0; i < arguments.length; i++) {
		var l = arguments[i].length;
		arguments[i].copy(ret, cur, 0, l);
		cur += l;
	}
	return ret;
}

/**
 * 解析 fixed header
 *
 * @param {Buffer} fixed_header 消息前面部分
 * @return {object}
 */
MQTT.decodeHeader = function (fixed_header) {
	var ret = {}
	var b1 = fixed_header[0];
	ret.message_type = b1 >> 4;
	ret.dup_flag = (b1 >> 3) & 1;
	ret.qos_level = (b1 >> 1) & 3;
	ret.retain = b1 & 1;
	
	// 消息的剩余长度，此算法来自MQTT v3.1
	var m = 1;
	var v = 0;
	var i = 1;
	do {
		var d = fixed_header[i++];
		if (typeof d == 'undefined')
			return false;
		v += (d & 127) * m;
		m *= 128;
	} while ((d & 128) != 0);
	ret.remaining_length = v;
	ret.fixed_header_length = i;
	return ret;
}