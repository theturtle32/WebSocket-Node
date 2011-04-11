var extend = require('./utils').extend;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketRequest = require('./WebSocketRequest');

var WebSocketServer = function WebSocketServer(httpServer, pathRegExp, protocol) {
    this._handlers = {
        upgrade: this.handleUpgrade.bind(this),
        requestAccepted: this.handleRequestAccepted.bind(this),
        connectionClose: this.handleConnectionClose.bind(this)
    };
    if (httpServer) {
        this.mount(httpServer, pathRegExp, protocol);
    }
    this.connections = [];
};

util.inherits(WebSocketServer, EventEmitter);

extend(WebSocketServer.prototype, {
    
    // TODO: Right now only one WebSocket server can be mounted on an HTTP
    // server object.  Eventually we should manage this through some kind of
    // mediator class that handles the 'upgrade' event on the HTTP server
    // and dispatches the request to the appropriate WebSocket server based
    // on resource (path) and protocol.
    mount: function(httpServer, pathRegExp, protocol) {
        this.httpServer = httpServer;
        if (typeof(pathRegExp) === 'string') {
            pathRegExp = new RegExp('^' + pathRegExp + '$');
        }
        this.pathRegExp = pathRegExp;
        this.protocol = protocol;
        httpServer.on('upgrade', this._handlers.upgrade);
    },

    unmount: function() {
        httpServer.removeListener('upgrade', this._handlers.upgrade);
    },
    
    closeAllConnections: function() {
        this.connections.forEach(function(connection) {
            connection.close();
        });
    },
    
    shutDown: function() {
        this.unmount();
        this.closeAllConnections();
    },

    handleUpgrade: function(request, socket, head) {
        var wsRequest = new WebSocketRequest(socket, request);
        wsRequest.once('requestAccepted', this._handlers.requestAccepted);
        
        if (this.pathRegExp && !this.pathRegExp.test(wsRequest.resource)) {
            // If we have a path regexp, only accept requests with a path
            // that matches
            wsRequest.reject(404, "Unknown resource");
            return;
        }
        
        try {
            wsRequest.readHandshake(request);
        }
        catch(e) {
            console.error((new Date()) + " WebSocket: Invalid handshake: " + e.toString());
            wsRequest.reject(400, e.toString());
            return;
        }
        
        // Verify that we're handling the requested protocol
        if (this.protocol && wsRequest.requestedProtocols.indexOf(this.protocol) === -1) {
            var requestedProtocol = wsRequest.requestedProtocols.join(', ');
            if (requestedProtocol.length === 0) {
                requestedProtocol = "(none)";
            }
            console.error((new Date()) + " WebSocket: Client requested unsupported protocol: " + requestedProtocol);
            wsRequest.reject(400, "Unsupported protocol " + requestedProtocol);
            return;
        }
        
        if (this.listeners('request').length > 0) {
            this.emit('request', wsRequest);
        }
        else {
            wsRequest.accept(this.protocol, wsRequest.origin);
        }
    }, 
    
    handleRequestAccepted: function(connection) {
        this.emit('connection', connection);
        connection.once('close', this._handlers.connectionClose);
        this.connections.push(connection);
    },
    
    handleConnectionClose: function(connection) {
        var index = this.connections.indexOf(connection);
        if (index !== -1) {
            this.connections.splice(index, 1);
        }
    }
});

module.exports = WebSocketServer;