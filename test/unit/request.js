var test = require('tape');

var WebSocketClient = require('../../lib/WebSocketClient');
var server = require('../shared/test-server');
var stopServer = server.stopServer;

var testCase = test('Request can only be rejected or accepted once.', function(t) {
  t.plan(6);
  
  server.prepare(function(err, wsServer) {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    
    wsServer.once('request', firstReq);
    connect(2);
    
    function firstReq(request) {
      var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
      var reject = request.reject.bind(request);
      
      t.doesNotThrow(accept, 'First call to accept() should succeed.');
      t.throws(accept, 'Second call to accept() should throw.');
      t.throws(reject, 'Call to reject() after accept() should throw.');
      
      wsServer.once('request', secondReq);
    }
    
    function secondReq(request) {
      var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
      var reject = request.reject.bind(request);
      
      t.doesNotThrow(reject, 'First call to reject() should succeed.');
      t.throws(reject, 'Second call to reject() should throw.');
      t.throws(accept, 'Call to accept() after reject() should throw.');
      
      t.end();
    }
    
    function connect(numTimes) {
      var client;
      for (var i=0; i < numTimes; i++) {
        client = new WebSocketClient();
        client.connect('ws://localhost:64321/', 'foo');
        client.on('connect', function(connection) { connection.close(); });
      }
    }
  });
});

testCase.on('end', function() {
  stopServer();
});
