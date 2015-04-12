var expect = require('expect.js');
var WebSocketClient = require('../../lib/WebSocketClient');
var server = require('../shared/test-server');
var stopServer = server.stopServer;


describe('WebSocket request handling', function() {
	var testServer;

	before(function(done) {
		server.prepare(function(err, server) {
			if (err) {
				done(new Error('unable to start test server: ' + err));
			}
			testServer = server;
			done();
		});
	});

	after(function() {
		stopServer();
	});

	it('should throw if accept() or reject() is called again', function(done) {
		testServer.once('request', firstRequest);

		for (var i=0; i<2; i++) {
			var client = new WebSocketClient();

			client.connect('ws://localhost:64321/', 'foo');

			client.on('connect', function(connection) {
				connection.close();
			});
		}

		function firstRequest(request) {
			var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin),
				reject = request.reject.bind(request);

			// First call to accept() should succeed.
			expect(accept).to.not.throwException();
			// Second call to accept() should throw.
			expect(accept).to.throwException();
			// Call to reject() after accept() should throw.
			expect(reject).to.throwException();

			testServer.once('request', secondRequest);
		}

		function secondRequest(request) {
			var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin),
				reject = request.reject.bind(request);

			// First call to reject() should succeed.
			expect(reject).to.not.throwException();
			// Second call to reject() should throw.
			expect(reject).to.throwException();
			// Call to accept() after reject() should throw.
			expect(accept).to.throwException();

			done();
		}
	});

	it('should handle protocol mismatch', function(done) {
		var client = new WebSocketClient();

		testServer.on('request', handleRequest);

		client.connect('ws://localhost:64321/', 'some_protocol_here');

		client.on('connect', function(connection) {
			connection.close();
		  	done(new Error('connect event should not be emitted on client'));
		});

		client.on('connectFailed', function() {
		  	done();
		});

		function handleRequest(request) {
			var accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);

			expect(accept).to.throwException();
		}
	});
});

