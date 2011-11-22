/**
 * MQTTClient
 * 
 * @author 老雷<leizongmin@gmail.com>
 * @version 0.1
 * @description for MQTT v3.1
 */
/*
 *	事件：	
 * 		connect：连接成功
 *		error：出错
 * 		disconnect：连接断开
 * 		publish：接收到消息
 *  		timeout：超时
 * 		ping：服务器响应ping
 *	方法：
 * 		connect：连接
 *  		subscribe：订阅主题
 * 		publish：发布消息
 * 		disconnect：关闭连接
 * 		ping：发送PINGREQ消息
 */
 
var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var debug = console.log;
var log = util.log;
var MQTT = require('./util');

exports.util = MQTT;


/**
 * 创建MQTTClient
 *
 * @param {string} host 主机
 * @param {int} port 端口 默认1883
 * @param {object} options 选项：client_id, username, password, alive_timer, will_retain, will_qos, will_flag, clean_session, will_topic, will_message
 */
var Client = exports.Client = function (host, port, options) {
	if (isNaN(port))
		port = 1883;
	if (!options)
		options = {}
	// 客户端ID
	if (typeof options.client_id == 'undefined')
		options.client_id = 'a' + new Date().getTime() + parseInt(Math.random() * 1000);
	// ping周期，单位：秒
	if (isNaN(options.alive_timer) || options.alive_timer < 1)
		options.alive_timer = 30;
	options.ping_timer = parseInt(options.alive_timer * 0.6 * 1000);
	// 用户名和密码
	if (typeof options.username == 'string' && options.username.length > 12)
		throw Error('user names are kept to 12 characters or fewer');
	if (typeof options.password == 'string' && options.password.length > 12)
		throw Error('passwords are kept to 12 characters or fewer');
	// Will flag
	if (options.will_flag && (typeof options.will_topic != 'string' || typeof options.will_message != 'string'))
		throw Error('missing will_topic or will_message when will_flag is set');
	
	this.host = host;
	this.port = port;
	this.options = options;
	
	this.connected = false;
	this._message_callback = {}
}

// 继承EventEmitter
util.inherits(Client, EventEmitter);

/**
 * 连接
 *
 * @param {function} callback 回调函数
 */
Client.prototype.connect = function (callback) {
	var self = this;
	
	if (typeof callback == 'function')
		this.once('connect', callback);
	
	var connection = this.connection = net.createConnection(this.port, this.host);
	connection.on('connect', function () {
		self._startSession();
	});
	connection.on('data', function (chunk) {
		self._onData(chunk);
	});
	connection.on('end', function () {
		self._onEnd();
	});
	connection.on('timeout', function () {
		self._onTimeout();
	});
	connection.on('error', function (err) {
		self._onError(err);
	});
	connection.on('close', function () {
		self._onClose();
	});
}

/** 发送CONNECT命令 */
Client.prototype._startSession = function () {
	// log('mqtt::startSession');
	
	var variable_header = new Buffer(12);
	// Protocol Name
	variable_header[0] = 0x00;
	variable_header[1] = 0x06;
	variable_header[2] = 0x4d;	// 'M'
	variable_header[3] = 0x51;	// 'Q'
	variable_header[4] = 0x49;	// 'I'
	variable_header[5] = 0x73;	// 's'
	variable_header[6] = 0x64;	// 'd'
	variable_header[7] = 0x70;	// 'p'
	// Protocol Version Number
	variable_header[8] = 0x03;	// Version
	// Connect Flags
	var opt = this.options;
	variable_header[9] = ((opt.username ? 1 : 0) << 7) +
						((opt.password ? 1 : 0) << 6) +
						(opt.will_retain << 5) +
						(opt.will_qos << 3) +
						(opt.will_flag << 2) +
						(opt.clean_session << 1);
	// Keep Alive timer
	var timer = this.options.alive_timer;
	variable_header[10] = timer >> 8; 
	variable_header[11] = timer & 0xFF;
	
	// Payload
	// Client Identifier
	var client_id = new Buffer(this.options.client_id);
	var client_id_length = new Buffer(2);
	client_id_length[0] = client_id.length >> 8;
	client_id_length[1] = client_id.length & 0xFF;
	// Will Topic
	if (opt.will_flag && opt.will_topic) {
		var will_topic = new Buffer(opt.will_topic);
		var will_topic_length = new Buffer(2);
		will_topic_length[0] = will_topic.length >> 8;
		will_topic_length[1] = will_topic.length & 0xFF;
	}
	else {
		var will_topic = new Buffer(0);
		var will_topic_length = new Buffer(0);
	}
	// Will Message
	if (opt.will_message && opt.will_message) {
		var will_message = new Buffer(opt.will_message);
		var will_message_length = new Buffer(2);
		will_message_length[0] = will_message.length >> 8;
		will_message_length[1] = will_message.length & 0xFF;
	}
	else {
		var will_message = new Buffer(0);
		var will_message_length = new Buffer(0);
	}
	// User Name
	if (opt.username) {
		var username = new Buffer(opt.username);
		var username_length = new Buffer(2);
		username_length[0] = username.length >> 8;
		username_length[1] = username.length & 0xFF;
	}
	else {
		var username = new Buffer(0);
		var username_length = new Buffer(0);
	}
	// Password
	if (opt.password) {
		var password = new Buffer(opt.password);
		var password_length = new Buffer(2);
		password_length[0] = password.length >> 8;
		password_length[1] = password.length & 0xFF;
	}
	else {
		var password = new Buffer(0);
		var password_length = new Buffer(0);
	}
	// 组装Payload
	var payload = MQTT.connect(client_id_length, client_id,
							will_topic_length, will_topic,
							will_message_length, will_message,
							username_length, username,
							password_length, password);
	// debug(client_id);
	// debug(payload);
	
	// Fixed Header
	var fixed_header = MQTT.fixedHeader(MQTT.CONNECT, 0, 0, false, variable_header.length + payload.length);
	
	var buffer = MQTT.connect(fixed_header, variable_header, payload);
	// debug(buffer);
	this.connection.write(buffer);
}

/** 连接end事件 */
Client.prototype._onEnd = function () {
	// log('connection::end');
}

/** 连接timeout事件 */
Client.prototype._onTimeout = function () {
	// log('connection::timeout');
	this.emit('timeout');
}

/** 连接error事件 */
Client.prototype._onError = function (err) {
	// log('connection::error');
	// debug(err.stack);
	this.emit('error');
}

/** 连接close事件 */
Client.prototype._onClose = function () {
	// log('connection::close');
	this.emit('disconnect');
	this.connected = false;
	delete this.connection;
}

/** 连接data事件 */
Client.prototype._onData = function (chunk) {
	// log('connection::data');
	// debug(chunk);
	
	// 如果上次的fixed header还未获取完整，则连接这两个数据块
	if (Buffer.isBuffer(this._fixed_header_chunk)) {
		// log('mqtt::fixed_header_block');
		this._onData(MQTT.connect(this._fixed_header_chunk, chunk));
	}
	// 如果PUBLISH消息还未获取完
	else if (this._data_not_enough) {
		// log('mqtt::PUBLISH_block');
		var handler = messageHandlers[MQTT.PUBLISH];
		handler(this, this._last_fixed_header, chunk);
	}
	// 正常解析
	else {
		var fixed_header = MQTT.decodeHeader(chunk);
		// debug(fixed_header);
		if (fixed_header == false) {
			this._fixed_header_chunk = chunk;
		}
		else {
			var handler = messageHandlers[fixed_header.message_type];
			if (typeof handler != 'function')
				this.emit('error', Error('Message type error: ' + fixed_header.message_type));
			else
				handler(this, fixed_header, chunk);
		}
	}
}

/** 消息处理函数 */
var messageHandlers = [];

/** 处理CONNACK消息 */
messageHandlers[MQTT.CONNACK] = function (self, fixed_header, chunk) {
	if (chunk.length < 4)
		self.emit('error', Error('CONNACK format error'));
	else {
		// Return Code
		var code = chunk[3];
		if (code == 0) {
			self.connected = true;
			self._last_message_id = 0;
			self.emit('connect');
			setTimeout(function () {
				self.ping();
			}, self.options.ping_timer);
		}
		else if (code > 0 && code < 6) {
			var msg = ['Successed',
				'Connection Refused: unacceptable protocol version',
				'Connection Refused: identifier rejected',
				'Connection Refused: server unavailable',
				'Connection Refused: bad user name or password',
				'Connection Refused: not authorized'
				];
			self.emit('error', Error(msg[code]));
			self.connected = false;
		}
		else {
			self.emit('error', 'Unknow Error: #' + code);
			self.connected = false;
		}
	}
}


/**
 * 发布消息
 *
 * @param {Buffer} topic 主题
 * @param {Buffer} payload 内容
 * @param {object} options 选项：dup_flag, qos_level, retain
 * @param {function} callback 回调函数 function (message_id)
 */
Client.prototype.publish = function (topic, payload, options, callback) {
	if (!this.connected) {
		this.emit('error', Error('Please connect to server first'));
		return;
	}
	
	if (!Buffer.isBuffer(topic))
		topic = new Buffer(topic);
	if (!Buffer.isBuffer(payload))
		payload = new Buffer(payload);
	if (!options)
		options = {}
	
	// Variable header
	// Topic name
	var topic_length = new Buffer(2);
	topic_length[0] = topic.length >> 8;
	topic_length[1] = topic.length & 0xFF;
	var topic_name = MQTT.connect(topic_length, topic);
	// Message ID
	if (options.qos_level > 0) {
		var message_id = new Buffer(2);
		this._last_message_id++;
		message_id[0] = this._last_message_id >> 8;
		message_id[1] = this._last_message_id & 0xFF;
	}
	else {
		var message_id = new Buffer(0);
	}
	
	// Fixed header
	var fixed_header = MQTT.fixedHeader(MQTT.PUBLISH,
			options.dup_flag, options.qos_level, options.retain,
			topic_name.length + message_id.length + payload.length);
	
	var buffer = MQTT.connect(fixed_header, topic_name, message_id, payload);
	// debug(buffer);
	this.connection.write(buffer);
	
	if (options.qos_level > 0 && typeof callback == 'function') 
		this._message_callback[this._last_message_id] = callback;
}

/** 处理PUBACK消息 */
messageHandlers[MQTT.PUBACK] = function (self, fixed_header, chunk) {
	if (chunk.length < 4)
		self.emit('error', Error('CONNACK format error'));
	else {
		var message_id = (chunk[2] << 8) + chunk[3];
		var callback = self._message_callback[message_id];
		if (typeof callback == 'function') {
			callback(message_id);
			delete self._message_callback[message_id];
		}
	}
}

/** 处理PUBREC消息 */
messageHandlers[MQTT.PUBREC] = function (self, fixed_header, chunk) {
	if (chunk.length < 4)
		self.emit('error', Error('PUBREC format error'));
	else {
		// 返回一个PUBREL消息给服务器
		var pubrel = chunk.slice(0, 4);
		pubrel[0] = 0x62;
		self.connection.write(pubrel);
	}
}

/** 处理PUBCOMP消息 */
messageHandlers[MQTT.PUBCOMP] = function (self, fixed_header, chunk) {
	if (chunk.length < 4)
		self.emit('error', Error('PUBCOMP format error'));
	else {
		var message_id = (chunk[2] << 8) + chunk[3];
		var callback = self._message_callback[message_id];
		if (typeof callback == 'function') {
			callback(message_id);
			delete self._message_callback[message_id];
		}
	}
}


/**
 * 订阅主题
 *
 * @param {Buffer} topic 主题
 * @param {object} options 选项：dup_flag, qos_level
 * @param {function} callback 回调函数 function (topic, qos_level)
 */
Client.prototype.subscribe = function (topic, options, callback) {
	if (!this.connected) {
		this.emit('error', Error('Please connect to server first'));
		return;
	}
	
	if (!Buffer.isBuffer(topic))
		topic = new Buffer(topic);
	if (!options)
		options = {}
	
	// Variable header
	// Message Identifier
	var message_id = new Buffer(2);
	this._last_message_id++;
	message_id[0] = this._last_message_id >> 8;
	message_id[1] = this._last_message_id & 0xFF;
	// Payload
	var topic_length = new Buffer(2);
	topic_length[0] = topic.length >> 8;
	topic_length[1] = topic.length & 0xFF;
	var requested_qos = new Buffer(1);
	requested_qos[0] = options.qos_level & 0x03;
	var payload = MQTT.connect(topic_length, topic, requested_qos);
	// Fixed Header
	var fixed_header = MQTT.fixedHeader(MQTT.SUBSCRIBE, options.dup_flag, 1, 0,
			message_id.length + payload.length);
			
	var buffer = MQTT.connect(fixed_header, message_id, payload);
	// debug(buffer);
	this.connection.write(buffer);
	
	if (typeof callback == 'function')
		this._message_callback[this._last_message_id] = function (qos_level) {
			callback(topic, qos_level);
		}
}

/** 处理SUBACK消息 */
messageHandlers[MQTT.SUBACK] = function (self, fixed_header, chunk) {
	if (chunk.length < 5)
		self.emit('error', Error('SUBACK format error'));
	else {
		var message_id = (chunk[2] << 8) + chunk[3];
		var callback = self._message_callback[message_id];
		if (typeof callback == 'function') {
			var qos_level = chunk[4];
			callback(qos_level);
			delete self._message_callback[message_id];
		}
	}
}


/**
 * 取消订阅
 *
 * @param {Buffer} topic 主题
 * @param {object} 选项：dup_flag, qos_level
 * @param {function} callback 回调函数 function (topic)
 */
Client.prototype.unSubscribe = function (topic, options, callback) {
	if (!this.connected) {
		self.emit('error', Error('Please connect to server first'));
		return;
	}
	
	if (!Buffer.isBuffer(topic))
		topic = new Buffer(topic);
	if (!options)
		options = {}
		
	// Variable header
	// Message Identifier
	var message_id = new Buffer(2);
	this._last_message_id++;
	message_id[0] = this._last_message_id >> 8;
	message_id[1] = this._last_message_id & 0xFF;
	// Payload
	var topic_length = new Buffer(2);
	topic_length[0] = topic.length >> 8;
	topic_length[1] = topic.length & 0xFF;
	var payload = MQTT.connect(topic_length, topic);
	// Fixed Header
	var fixed_header = MQTT.fixedHeader(MQTT.UNSUBSCRIBE, options.dup_flag, 1, 0,
			message_id.length + payload.length);
			
	var buffer = MQTT.connect(fixed_header, message_id, payload);
	// debug(buffer);
	this.connection.write(buffer);
	
	if (typeof callback == 'function')
		this._message_callback[this._last_message_id] = function () {
			callback(topic);
		}
}

/** 处理UNSUBACK消息 */
messageHandlers[MQTT.UNSUBACK] = function (self, fixed_header, chunk) {
	if (chunk.length < 4)
		self.emit('error', Error('UNSUBACK format error'));
	else {
		var message_id = (chunk[2] << 8) + chunk[3];
		var callback = self._message_callback[message_id];
		if (typeof callback == 'function') {
			callback();
			delete self._message_callback[message_id];
		}
	}
}


/**
 * 检查服务器状态
 */
Client.prototype.ping = function (callback) {
	var self = this;
	if (!this.connected) {
		this.emit('error', Error('Please connect to server first'));
		return;
	}
	
	if (typeof callback == 'function')
		this.once('ping', callback);
	
	// Fixed header
	var buffer = new Buffer(2);
	buffer[0] = MQTT.PINGREQ << 4;
	buffer[1] = 0x00;
	
	// 检查是否超时
	this._wait_for_pingresp = true;
	setTimeout(function () {
		if (self._wait_for_pingresp)
			self._onTimeout();
	}, this.options.alive_timer * 1000);
	
	// debug(buffer);
	this.connection.write(buffer);
}

/** 处理PINGRESP消息 */
messageHandlers[MQTT.PINGRESP] = function (self, fixed_header, chunk) {
	if (chunk.length < 2)
		self.emit('error', Error('PINGRESP format error'));
	else {
		// log('mqtt::PINGRESP');
		self._wait_for_pingresp = false;
		setTimeout(function () {
			self.ping();
		}, self.options.ping_timer);
		self.emit('ping');
	}
}


/**
 * 断开连接
 *
 * @param {function} callback 回调函数
 */
Client.prototype.disconnect = function (callback) {
	if (!this.connected)
		return;
	
	if (typeof callback == 'function')
		this.once('disconnect', callback);
	
	// Fixed header
	var buffer = new Buffer(2);
	buffer[0] = MQTT.DISCONNECT << 4;
	buffer[1] = 0x00;
	
	// debug(buffer);
	this.connection.write(buffer);
}


/** 处理PUBLISH 消息 */
messageHandlers[MQTT.PUBLISH] = function (self, fixed_header, chunk) {
	// log('mqtt::PUBLISH');
	if (self._data_not_enough) {
		// log('self._data_not_enough = ' + self._data_not_enough);
		// 如果数据已足够
		if (self._data_offset + chunk.length >= self._data_length) {
			self._data_not_enough = false;
			messageHandlers[MQTT.PUBLISH](self, fixed_header,  MQTT.connect(self._data_chunk, chunk));
		}
		// 如果数据还是不够
		else {
			chunk.copy(self._data_chunk, self._data_offset, 0, chunk.length);
			self._data_offset += chunk.length;
		}
	}
	else {
		var data_length = fixed_header.fixed_header_length + fixed_header.remaining_length;
		if (chunk.length >= data_length) {
			// 读取出PUBLISH消息
			// debug(chunk);
			var topic_length = (chunk[fixed_header.fixed_header_length] << 8)  +
								chunk[fixed_header.fixed_header_length + 1];
			var topic = chunk.slice(fixed_header.fixed_header_length + 2,
								fixed_header.fixed_header_length + 2 + topic_length);
			// 如果消息QoS等级大于0，则包含message id
			if (fixed_header.qos_level > 0) {
				var message_id = (chunk[fixed_header.fixed_header_length + 2 + topic_length] << 8) +
							chunk[fixed_header.fixed_header_length + 3 + topic_length];
				var payload = chunk.slice(fixed_header.fixed_header_length + 2 + topic_length + 2,
								fixed_header.fixed_header_length + fixed_header.remaining_length);
			}
			else {
				message_id = 0;
				var payload = chunk.slice(fixed_header.fixed_header_length + 2 + topic_length,
								fixed_header.fixed_header_length + fixed_header.remaining_length);
			}
			self._onPublish(topic, payload, message_id);
			// 释放上次操作的空间
			delete self._data_chunk;
			delete self._last_fixed_header;
			// 如果消息QoS等级大于0，则回复此消息
			if (fixed_header.qos_level > 0)
				self._response(fixed_header.qos_level, message_id);
			
			// 如果还有剩余的数据，则重新触发_onData()
			if (chunk.length > data_length) {
				self._onData(chunk.slice(
					fixed_header.fixed_header_length + fixed_header.remaining_length,
					chunk.length
				));
			}
		}
		// 如果已获取余下数据的长度，但是数据块长度不足
		else {
			self._data_not_enough = true;
			self._data_length = data_length;
			self._data_chunk = new Buffer(data_length);
			chunk.copy(self._data_chunk, 0, 0, chunk.length);
			self._data_offset = chunk.length;
			self._last_fixed_header = fixed_header;
		}
	}
}

/** 有新PUBLISH消息 */
Client.prototype._onPublish = function (topic, payload, message_id) {
	// debug(topic);
	// debug(payload);
	// debug(message_id);
	this.emit('publish', topic, payload, message_id);
}

/** 回复QoS等级大于0的消息 */
Client.prototype._response = function (qos_level, message_id) {
	// log('mqtt::response');
	
	var buffer = new Buffer(4);
	if (qos_level == 1)
		buffer[0] = MQTT.PUBACK << 4;
	else
		buffer[0] = MQTT.PUBREC << 4;
	buffer[1] = qos_level << 1;
	buffer[2] = message_id >> 8;
	buffer[3] = message_id & 0xFF;
	
	// debug(buffer);
	this.connection.write(buffer);
}