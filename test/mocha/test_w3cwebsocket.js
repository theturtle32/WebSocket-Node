var expect = require('expect.js');
var W3CWebSocket = require('../../lib/W3CWebSocket');
var startEchoServer = require('../shared/start-echo-server');


describe('W3C WebSocket API', function() {
	var echoServer;

	before(function(done) {
		startEchoServer(function(err, server) {
			if (err) {
				done(new Error('unable to start echo server: ' + err));
			}
			echoServer = server;
			done();
		});
	});

	after(function() {
		if (echoServer) {
			echoServer.kill();
		}
	});

	it('should emit W3C WebSocket events', function(done) {
		var counter = 0,
			message = 'This is a test message',
			ws = new W3CWebSocket('ws://localhost:8080');

		ws.onopen = function() {
			expect(++counter).to.be(1, 'onopen should be called first');

			ws.send(message);
		};

		ws.onerror = function(event) {
			done(new Error('no errors are expected: ' + event));
		};


		ws.onmessage = function(event) {
			expect(++counter).to.be(2, 'onmessage should be called second');

			expect(event.data).to.be(message, 'received message data should match sent message data');

			ws.close();
		};

		ws.onclose = function(event) {
			expect(++counter).to.be(3, 'onclose should be called last');

			done();
		};
	});
});
