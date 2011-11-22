# MQTTClient for Node.js


To start before, you need to know something about MQTT, please see
[MQTT V3.1 Protocol Specification](http://public.dhe.ibm.com/software/dw/webservices/ws-mqtt/mqtt-v3r1.html)

在使用本模块之前，你需要了解一些MQTT协议的知识，可参阅：[MQTT V3.1 协议规范](http://public.dhe.ibm.com/software/dw/webservices/ws-mqtt/mqtt-v3r1.html)


Install 安装
=================

**npm install MQTTClient**


Examples 示例
=================

```javascript

	var MQTTClient = require('MQTTClient').Client;
	
	// if you don't assigned a client_id, will automatically assigns one
	// 如果没有指定client_id，则程序会自动分配一个
	var options = {
		client_id:	'you_client_id'
	}
	var client = new MQTTClient('localhost', 1883, options);
	
	client.connect(function () {
		// do something if connect success
		// 在此处写连接成功后执行的代码
	});
```

	
Subscribe & Un Subscribe 订阅和退订
=================

```javascript

	// subscribe to a topic
	// 订阅一个主题
	var options = {
		dup_flag:	0,
		qos_level:	0
	}
	client.subscribe('topic_name', options, function (topic, qos_level) {
		// do something if success
		// 在此处写订阅成功后执行的代码
	});
	// Simplified:	client.subscribe('topic_name');
	// 也可以这样：	client.subscribe('主题');
	
	// un subscribe a topic
	// 退订一个主题
	client.unSubscribe('topic_name', options, function (topic) {
		// do something if success
		// 在此处写退订成功后执行的代码
	});
	// Simplified:	client.unSubscribe('topic_name');
	// 也可以这样：	client.unSubscribe('主题');
```
	

Publish 发布
=================

```javascript

	// publish message to a topic
	// 发布一个消息到指定主题
	var options = {
		dup_flag:	0,
		qos_level:	0,
		retain:		false
	}
	client.publish('topic_name', 'payload', options, function (message_id) {
		// do something if success
		// 在此处写发布成功后执行的代码
	});
	// Simplified:	client.publish('topic_name', 'payload');
	// 也可以这样：	client.publish('主题', '内容');
```	
	
	
Other 其他
=================

```javascript

	// send a PINGREQ to keep alive, will automatically be called
	// 发送一个PINGREQ消息给服务器，一般情况下会自动执行
	client.ping(function () {
		// do something if success
		// 在此处写服务器返回PINGRESP消息后执行的代码
	});
	
	// disconnect
	// 断开连接
	client.disconnect(function () {
		// do something if success
		// 在此处写服务器断开连接后执行的代码
	});
```
	
	
Event
=================

### connect

> Connect to server success, after received a CONNACK message from the server

> 当连接服务器成功，并收到CONNACK消息后，触发此事件

> **Arguments**: None


### error

> Has an error

> 当发生错误时触发此事件

> **Arguments**: error


### disconnect

> The server close the socket connection

> 当服务器断开连接时触发此事件

> **Arguments**: None


### ping

> After received a PINGRESP message from the server

> 当收到服务器返回的PINGRESP消息时触发此事件

> **Arguments**: None


### timeout

> Not received the PINGRESP message out of **options.alive_timer** seconds

> 当超过指定时间（有options.alive_timer设置）没有收到服务器返回的PINGRESP消息时触发此事件

> **Arguments**: None


### publish

> Received a PUBLISH message

> 当收到PUBLISH消息时触发此事件

> **Arguments**:  topic, payload, message_id

> 参数topic为消息的主题，payload为消息内容, message_id为消息ID
