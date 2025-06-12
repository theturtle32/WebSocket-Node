const test = require('tape');

const WebSocketClient = require('../../lib/WebSocketClient');
const server = require('../shared/test-server');
const stopServer = server.stopServer;

test('Request can only be rejected or accepted once.', function(t) {
  t.plan(6);
  
  t.on('end', () => {
    stopServer();
  });
  
  server.prepare((err, wsServer) => {
    if (err) {
      t.fail('Unable to start test server');
      return t.end();
    }
    
    wsServer.once('request', firstReq);
    connect(2);
    
    function firstReq(request) {
      const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
      const reject = request.reject.bind(request);
      
      t.doesNotThrow(accept, 'First call to accept() should succeed.');
      t.throws(accept, 'Second call to accept() should throw.');
      t.throws(reject, 'Call to reject() after accept() should throw.');
      
      wsServer.once('request', secondReq);
    }
    
    function secondReq(request) {
      const accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
      const reject = request.reject.bind(request);
      
      t.doesNotThrow(reject, 'First call to reject() should succeed.');
      t.throws(reject, 'Second call to reject() should throw.');
      t.throws(accept, 'Call to accept() after reject() should throw.');
      
      t.end();
    }
    
    function connect(numTimes) {
      let client;
      for (let i=0; i < numTimes; i++) {
        client = new WebSocketClient();
        client.connect('ws://localhost:64321/', 'foo');
        client.on('connect', (connection) => { connection.close(); });
      }
    }
  });
});


test('Protocol mismatch should be handled gracefully', function(t) {
  let wsServer;
  
  t.test('setup', function(t) {
    server.prepare((err, result) => {
      if (err) {
        t.fail('Unable to start test server');
        return t.end();
      }
      
      wsServer = result;
      t.end();
    });
  });
  
  t.test('mismatched protocol connection', function(t) {
    t.plan(2);
    wsServer.on('request', handleRequest);
    
    const client = new WebSocketClient();
    
    const timer = setTimeout(() => {
      t.fail('Timeout waiting for client event');
    }, 2000);
    
    client.connect('ws://localhost:64321/', 'some_protocol_here');
    client.on('connect', (connection) => {
      clearTimeout(timer);
      connection.close();
      t.fail('connect event should not be emitted on client');
    });
    client.on('connectFailed', () => {
      clearTimeout(timer);
      t.pass('connectFailed event should be emitted on client');
    });
    
    
    
    function handleRequest(request) {
      const accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);
      t.throws(accept, 'request.accept() should throw');
    }
  });
  
  t.test('teardown', function(t) {
    stopServer();
    t.end();
  });
});
