/**
  * MQTTClient 
  *
  * @author 老雷<leizongmin@gmail.com>
  * @description 修改自https://github.com/yilun/node_mqtt_client （@author Fan Yilun）
  */
/**
 * 事件：	start: 会话开始		error: 出错			close: 连接被关闭		message: 收到消息		timeout: 超时
 * 方法：	sub: 订阅主题		pub: 发布消息			close: 关闭连接
 */
 
var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var MQTTCONNECT = 0x10;
var MQTTPUBLISH = 0x30;
var MQTTSUBSCRIBE = 0x80; //8<<4;

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
	this.conn.setEncoding('utf8');
    
	// 设置心跳定时器
	self._resetTimeUp();

	self.conn.addListener('data', function (data) {
		if(!self.sessionOpened){
			if(data.length == 4 && data.charCodeAt(3) == 0){
				self.sessionOpened = true;
				// debug("Session opend\n");
				// 触发sessionOpened事件（会话开始）
				self.emit("start");

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
				var buf = new Buffer(data);
				self._onData(buf);
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
		self.emit('close');
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
    
	this.conn.write(buffer, 'ascii');

	this.sessionSend = true;
	//debug('Connected as: ' + id + '\n');
};


/**
 * 订阅主题
 *
 * @param {string} sub_topic 主题
 */
MQTTClient.prototype.sub = function (sub_topic) {
	if(this.connected){
		var i = 0;
		var buffer = new Buffer(7+sub_topic.length);;
    
		//fixed header
		buffer[i++] = MQTTSUBSCRIBE;
		buffer[i++] = 5 + sub_topic.length;

		//varibale header
		buffer[i++] = 0x00;
		buffer[i++] = 0x0a; //message id

		//payload
		buffer[i++] = 0x00;
		buffer[i++] = sub_topic.length;

		for (var n = 0; n < sub_topic.length; n++) {
			buffer[i++] = sub_topic.charCodeAt(n);
		}
		buffer[i++] = 0x00;
    
		// debug('Subcribe to:'+sub_topic);
		
		this.conn.write(buffer, 'ascii');
    
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
 * @param {string} payload 消息
 */
MQTTClient.prototype.pub = function (pub_topic, payload) {
	if(this.connected){
		var i = 0, n = 0;
		var var_header = new Buffer(2 + pub_topic.length);
        
		//Variable header
		//Assume payload length no longer than 128
		var_header[i++] = 0;
		var_header[i++] = pub_topic.length;
		for (n = 0; n < pub_topic.length; n++) {
			var_header[i++] = pub_topic.charCodeAt(n);
		}
		//QoS 1&2
		//var_header[i++] = 0;
		//var_header[i++] = 0x03;
        
		i = 0;
		var buffer = new Buffer(2 + var_header.length+payload.length);
        
		//Fix header
		buffer[i++] = MQTTPUBLISH;
		buffer[i++] = payload.length + var_header.length;
		for (n = 0; n < var_header.length; n++) {
			buffer[i++] = var_header[n];
		}
		for (n = 0; n < payload.length; n++) { //Insert payloads
			buffer[i++] = payload.charCodeAt(n);
		}
        
		// debug("||Publish|| "+pub_topic+' : '+payload);
		
		this.conn.write(buffer, 'ascii');
        
		this._resetTimeUp();
	}
};

/**
 * 接收到数据
 *
 * @param {buffer} data 数据
 */
MQTTClient.prototype._onData = function(data){
	var type = data[0]>>4;
	 // PUBLISH
	if (type == 3) {
		var tl = data[3]+data[2]; //<<4
		var topic = new Buffer(tl);
		for(var i = 0; i < tl; i++){
			topic[i] = data[i+4];
		}
		if(tl+4 <= data.length){
			var payload = data.slice(tl+4, data.length);
			// debug("Receive on Topic:"+topic);
			// debug("Payload:"+payload+'\n');
			this.emit("message", topic, payload);
		}
	} 
	 // PINGREG -- Ask for alive
	else if (type == 12) {
		// Send [208, 0] to server
		// debug('Send 208 0');
		var packet208 = new Buffer(2);
		packet208[0] = 0xd0;
		packet208[1] = 0x00;
		
		this.conn.write(packet208, 'utf8');
        
		this._resetTimeUp();
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
	this.conn.write(packet192, 'utf8');
    
	this._resetTimeUp();
};

/**
 * 断开连接
 */
MQTTClient.prototype.close = function () {
	// Send [224,0] to server
	var packet224 = new Buffer(2);
	packet224[0] = 0xe0;
	packet224[1] = 0x00;
	this.conn.write(packet224, 'utf8');
};