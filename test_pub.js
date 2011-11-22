var mqtt = require('./client');

var opt = {
	username: 'abcd',
	password: '123456'
}

var c = new mqtt.Client('iot.ucdok.com', 1883, opt);
c.connect(function () {
	c.publish('abc', '123', {
		qos_level:	2
	}, function (message_id) {
		console.log('message_id = ' + message_id);
	});
});

c.on('error', function (err) {
	console.log(err);
});

c.on('publish', function (topic, payload) {
	console.log('[' + topic + ']\t' + payload);
});