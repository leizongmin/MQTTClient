/**
  * MQTTClient 
  *
  * @author 老雷<leizongmin@gmail.com>
  * @description 修改自https://github.com/yilun/node_mqtt_client （@author Fan Yilun）
  */
/**
 * 事件：	connect: 会话开始		error: 出错			disconnect: 连接被关闭		publish: 收到消息		timeout: 超时
 * 方法：	subscribe: 订阅主题		publish: 发布消息		disconnect: 关闭连接
 */
 
var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var MQTTCONNECT = 0x10;
var MQTTPUBLISH = 0x30;
var MQTTSUBSCRIBE = 0x80;
var MQTTUNSUBSCRIBE = 0xA0;
var KEEPALIVE = 15000;

var debug = console.log;

/**
 * 创建MQTT客户端
 *
 * @param {string} host 主机
 * @param {int} port 端口 默认1883
 * @param {string} clientID 客户端ID
 */
var  MQTTClient = module.exports = function (host, port,  clientID) {
	var self = this;
	
	if (isNaN(port))
		port = 1883;
	if (typeof clientID == 'undefined')
		clientID = '' + new Date().getTime() + parseInt(Math.random() * 1000);
	
	this.connected = false;
	this.sessionSend = false;
	this.sessionOpened = false;
	this.id = clientID;

	this.conn = net.createConnection(port, host);
    
	// 设置心跳定时器
	self._resetTimeUp();

	self.conn.addListener('data', function (data) {
		if(!self.sessionOpened){
			if(data.length == 4 && data[3] == 0){
				self.sessionOpened = true;
				// debug("Session opend\n");
				// 触发sessionOpened事件（会话开始）
				self.emit('connect');

				// 重置心跳定时器
				self._resetTimeUp(3000);
			}
			else{
				clearTimeout(self.timeout);
				// 触发sessionFailed事件
				self.emit("error", Error('ESF:Start session failed.'));
				self.conn.end();
				return;
			}
		} 
		else {
			if(data.length > 2){
				self._onData(data);
			}
		}
	});

	self.conn.addListener('connect', function () {
		self.connected = true;
		// 连接成功，开始会话
		self._openSession(self.id);
	});

	self.conn.addListener('end', function() {
		self.connected = false;
		self.sessionSend = false;
		self.sessionOpened = false;
		// debug('Connection closed by broker');
		self.emit('disconnect');
	});
}

// 继承EventEmitter
util.inherits(MQTTClient, EventEmitter);

/**
 * 重设心跳
 *
 * @param {int} t 时间，毫秒 默认为25000
 */
MQTTClient.prototype._resetTimeUp = function (t) {
	var self = this;
	var t = isNaN(t) ? 25000 : t;
	clearTimeout(self.timeout);
	self.timeout = setTimeout(function() {
		self._timeUp();
	}, t);
}

/**
 * 心跳
 */
MQTTClient.prototype._timeUp = function(){
	if(this.connected && this.sessionOpened){
		this._live();
	} 
	else if (!this.connected ){
		// debug('MQTT connect to server time out');
		// 触发timeout事件
		this.emit("timeout");
	}
	else {
		// debug('Unknow state');
	}
};
 
 /**
  * 开始会话
  *
  * @param {string} id 客户端ID
  */
MQTTClient.prototype._openSession = function (id) {
	var i = 0;
	var buffer = new Buffer(16+id.length);
	
	buffer[i++] = MQTTCONNECT;
	buffer[i++] = 14+id.length;
	buffer[i++] = 0x00;
	buffer[i++] = 0x06;
	buffer[i++] = 0x4d;
	buffer[i++] = 0x51;
	buffer[i++] = 0x49;
	buffer[i++] = 0x73;
	buffer[i++] = 0x64;
	buffer[i++] = 0x70;
	buffer[i++] = 0x03;

	buffer[i++] = 0x02;

	// 保持连接30秒
	buffer[i++] = 0x00;
	buffer[i++] = KEEPALIVE/500;

	buffer[i++] = 0x00;
	buffer[i++] = id.length;

	// 插入客户端ID（utf-8）
	for (var n = 0; n < id.length; n++) {  
		buffer[i++] = id.charCodeAt(n);
	}
    
	this.conn.write(buffer);

	this.sessionSend = true;
};


/**
 * 订阅主题
 *
 * @param {string} sub_topic 主题
 * @param {int} level QoS等级: 0, 1, 2
 */
MQTTClient.prototype.subscribe = function (sub_topic, level) {
	if(this.connected){
		// 将topic转换为Buffer类型
		if (!Buffer.isBuffer(sub_topic))
			sub_topic = new Buffer(sub_topic);
		// Varibale header 
		// message id
		var message_id = makeMessageId();
		// Payload
		var payload = new Buffer(3 + sub_topic.length);
		// topic length
		var i = 0;
		payload[i++] = sub_topic.length >> 8;
		payload[i++] = sub_topic.length & 0xFF;
		// topic string
		sub_topic.copy(payload, i, 0, sub_topic.length);
		i += sub_topic.length;
		// requested QoS
		payload[i++] = Number(level);
		// Fixed header
		var fixed_header = fixHeader(MQTTSUBSCRIBE, 0, 0, 0, payload.length + 2);
		var buffer = new Buffer(fixed_header.length + payload.length + 2);
		// 连接fixheader
		fixed_header.copy(buffer, 0, 0, fixed_header.length);
		// 连接message id
		message_id.copy(buffer, fixed_header.length, 0, 2);
		// 连接payload
		payload.copy(buffer, fixed_header.length + 2, 0, payload.length);
		this.conn.write(buffer);
		this._resetTimeUp();
	}
	else {
		this.emit('error', Error('ECC:Connection closed.'));
	}
};

/**
 * 发布消息
 *
 * @param {string} pub_topic 主题
 * @param {Buffer|string} payload 消息
 * @param {int|bool} retained 是否保留
 */
MQTTClient.prototype.publish = function (pub_topic, payload, retained) {
	if(this.connected){
		// 将topic和payload转换为Buffer类型
		if (!Buffer.isBuffer(pub_topic))
			pub_topic = new Buffer(pub_topic);
		if (!Buffer.isBuffer(payload))
			payload = new Buffer(payload);
		
		var i = 0, n = 0;
		var var_header = new Buffer(2 + pub_topic.length);
        
		// Variable header
		// topic length
		var_header[i++] = pub_topic.length >> 8
		var_header[i++] = pub_topic.length & 0xFF;
		// topic string
		pub_topic.copy(var_header, i, 0, pub_topic.length);
		// payload
		i = 0;
		// Fix header
		var fixed_header = fixHeader(MQTTPUBLISH, 0, 0, retained, var_header.length + payload.length);
		var buffer = new Buffer(fixed_header.length + var_header.length + payload.length);
		fixed_header.copy(buffer, 0, 0, fixed_header.length);
		// 连接topic
		var_header.copy(buffer, fixed_header.length, 0, var_header.length);
		// 连接payload
		payload.copy(buffer, fixed_header.length + var_header.length, 0, payload.length);
		// debug(buffer)
		this.conn.write(buffer);
		this._resetTimeUp();
	}
};

/**
 * 退订主题
 *
 * @param {string} topic 主题
 */
MQTTClient.prototype.unSubscribe = function (topic) {
	if (this.connected){
		if (!Buffer.isBuffer(topic))
			topic = new Buffer(topic);
		// Varibale header 
		// message id
		var message_id = makeMessageId();
		// Payload
		var payload = new Buffer(2 + topic.length);
		// topic length
		var i = 0;
		payload[i++] = topic.length >> 8;
		payload[i++] = topic.length & 0xFF;
		// topic string
		topic.copy(payload, i, 0, topic.length);
		i += topic.length;
		// Fixed header
		var fixed_header = fixHeader(MQTTUNSUBSCRIBE, 0, 0, 0, payload.length + 2);
		var buffer = new Buffer(fixed_header.length + payload.length + 2);
		// 连接fixheader
		fixed_header.copy(buffer, 0, 0, fixed_header.length);
		// 连接message id
		message_id.copy(buffer, fixed_header.length, 0, 2);
		// 连接payload
		payload.copy(buffer, fixed_header.length + 2, 0, payload.length);
		this.conn.write(buffer);
		this._resetTimeUp();
	}
}

/**
 * 接收到数据
 *
 * @param {buffer} data 数据
 */
MQTTClient.prototype._onData = function(data){
	var type = data[0] >> 4;
	 // PUBLISH
	if (type == 3) {
		// debug(data);
		var offset = 0;
		// 消息的剩余长度
		var m = 1;
		var v = 0;
		do {
			var d = data[1 + offset++];
			v += (d & 127) * m;
			m *= 128;
		} while ((d & 128) != 0);
		var rl = v;
		offset--;
		// debug('rl = ' + rl);
		// 如果消息长度不足，则等待下次接收完数据，并返回
		if (data.length < offset + 2 + rl) {
			this._notEnough = true;
			this._notEnoughFullLength = offset + 2 + rl;
			this._notEnoughData = new Buffer(this._notEnoughFullLength);
			data.copy(this._notEnoughData, 0, 0, data.length);
			this._notEnoughLength = data.length;
			return;
		}
		// 取主题长度
		var tl = (data[offset + 2] << 8) + data[offset + 3];
		// 取主题字符
		var topic = data.slice(offset + 4, offset + 4 + tl);
		// 取消息内容
		var payload = data.slice(offset + 4 + tl, offset + 2 + rl);
		// 触发message事件
		this.emit('publish', topic, payload);
		
		// 如果是多条消息组合在一起的，则用剩余的消息触发下一个_onData事件
		if (data.length > offset + 2 + rl)
			this._onData(data.slice(offset + 2 + rl, data.length));
	}
	 // PINGREG -- Ask for alive
	else if (type == 12) {
		// Send [208, 0] to server
		// debug('Send 208 0');
		var packet208 = new Buffer(2);
		packet208[0] = 0xd0;
		packet208[1] = 0x00;
		
		this.conn.write(packet208);
        
		this._resetTimeUp();
	}
	else {
		// 检查是否需要接上次的数据块
		if (this._notEnough) {
			if (data.length + this._notEnoughLength > this._notEnoughFullLength) {
				var need = this._notEnoughFullLength - this._notEnoughLength;
				data.copy(this._notEnoughData, this._notEnoughLength, 0, need);
				this._notEnough = false;
				this._onData(this._notEnoughData);
				this._onData(data.slice(need, data.length - need));
			}
			else {
				data.copy(this._notEnoughData, this._notEnoughLength, 0, data.length);
				this._notEnoughLength += data.length;
				if (this._notEnoughLength >= this._notEnoughFullLength) {
					this._notEnough = false;
					this._onData(this._notEnoughData);
				}
			}
			if (!this._notEnough) {
				delete this._notEnoughData;
				delete this._notEnoughLength;
				delete this._notEnoughFullLength;
			}
		}
	}
}

/**
 * 发送心跳信号
 */
MQTTClient.prototype._live = function () {
	// Send [192, 0] to server
	var packet192 = new Buffer(2);
	packet192[0] = 0xc0;
	packet192[1] = 0x00;
	this.conn.write(packet192);
    
	this._resetTimeUp();
};

/**
 * 断开连接
 */
MQTTClient.prototype.disconnect = function () {
	// Send [224,0] to server
	var packet224 = new Buffer(2);
	packet224[0] = 0xe0;
	packet224[1] = 0x00;
	this.conn.write(packet224);
	this.conn.destroy();
	clearTimeout(this.timeout);
};

/**
 * 生成header
 *
 * @param {int} type 消息类型
 * @param {int} dup DUP标记
 * @param {int} qos QoS等级
 * @param {int} retain 是否保留
 * @param {int} length 剩余消息长度
 * @return {Buffer}
 */ 
var fixHeader = function (type, dup, qos, retain, length) {
	var b1 = type | 
			(Number(dup) << 3) |
			(Number(qos) << 1) |
			Number(retain);
	// 生成字符串长度字节
	var la = [];
	var x = length;
	var d;
	do {
		d = x % 128;
		x = Math.floor(x / 128);
		if (x > 0)
			d = d | 0x80
		la.push(d);
	} while (x > 0);
	// 组装
	var ret = new Buffer(la.length + 1);
	var i = 0;
	ret[i++] = b1;
	for (var j = 0, d; d = la[j]; j++)
		ret[i++] = d;
	return ret;
}

/**
 * 生成message id
 *
 * @return {Buffer}
 */
var ___last_message_id = 0;
var makeMessageId = function () {
	___last_message_id++;
	var ret = new Buffer(2);
	ret[0] = ___last_message_id >> 8;
	ret[1] = ___last_message_id & 0xFF;
	return ret;
}