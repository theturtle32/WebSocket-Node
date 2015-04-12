var expect = require('expect.js');
var WebSocketClient = require('../../lib/WebSocketClient');
var server = require('../shared/test-server');
var stopServer = server.stopServer;


describe('TCP connection dropped before accepting the WebSocket request', function() {
	var testServer,
		client = new WebSocketClient();

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

	it('server should handle client TCP premature disconnection', function(done) {
		testServer.on('request', function(request) {
			setTimeout(function() {
				request.accept(request.requestedProtocols[0], request.origin);
			}, 500);
		});

		testServer.on('connect', function(connection) {
			connection.on('close', function(code, reason) {
				expect(code).to.be(1006);
				expect(reason).to.be('TCP connection lost before handshake completed.');

				done();
			});

			connection.on('error', function(error) {
				done(new Error('no error should happen on the connection'));
			});
		});

		client.on('connect', function(connection) {
			done(new Error('client should never connect'));
		});

		client.connect('ws://localhost:64321/', ['test']);

		// Close the TCP connection before we hear back form the server.
		setTimeout(function() {
			client.abort();
		}, 250);
	});
});

