var mqtt = require('./client');

var c = new mqtt.Client('iot.ucdok.com');
c.connect(function () {
	c.subscribe('abc', {
		qos_level: 1
	}, function (topic, qos_level) {
		console.log('Topic=' + topic + '   Qos=' + qos_level);
	});
});

c.on('error', function (err) {
	console.log(err);
});

c.on('publish', function (topic, payload) {
	console.log('[' + topic + ']\t' + payload);
});