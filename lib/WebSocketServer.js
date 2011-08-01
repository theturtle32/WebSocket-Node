var extend = require('./utils').extend;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketRequest = require('./WebSocketRequest');

var WebSocketServer = function WebSocketServer(config) {
    this._handlers = {
        upgrade: this.handleUpgrade.bind(this),
        requestAccepted: this.handleRequestAccepted.bind(this),
        connectionClose: this.handleConnectionClose.bind(this)
    };
    this.connections = [];
    if (config) {
        this.mount(config);
    }
};

util.inherits(WebSocketServer, EventEmitter);

WebSocketServer.prototype.mount = function(config) {
    this.config = {
        // The http server instance to attach to.  Required.
        httpServer: null,
        
        // 64KiB max frame size.
        maxReceivedFrameSize: 0x10000,

        // 1MiB max message size, only applicable if
        // assembleFragments is true
        maxReceivedMessageSize: 0x100000,
        
        // Outgoing messages larger than fragmentationThreshold will be
        // split into multiple fragments.
        fragmentOutgoingMessages: true,
        
        // Outgoing frames are fragmented if they exceed this threshold.
        // Default is 16KiB
        fragmentationThreshold: 0x4000,
        
        // If true, the server will automatically send a ping to all
        // clients every 'keepaliveInterval' milliseconds.
        keepalive: true,
        
        // The interval to send keepalive pings to connected clients.
        keepaliveInterval: 20000,
        
        // If true, fragmented messages will be automatically assembled
        // and the full message will be emitted via a 'message' event.
        // If false, each frame will be emitted via a 'frame' event and
        // the application will be responsible for aggregating multiple
        // fragmented frames.  Single-frame messages will emit a 'message'
        // event in addition to the 'frame' event.
        // Most users will want to leave this set to 'true'
        assembleFragments: true,
        
        // If this is true, websocket connections will be accepted
        // regardless of the path and protocol specified by the client.
        // The protocol accepted will be the first that was requested
        // by the client.  Clients from any origin will be accepted.
        // This should only be used in the simplest of cases.  You should
        // probably leave this set to 'false' and inspect the request
        // object to make sure it's acceptable before accepting it.
        autoAcceptConnections: false,
        
        // The Nagle Algorithm makes more efficient use of network resources
        // by introducing a small delay before sending small packets so that
        // multiple messages can be batched together before going onto the
        // wire.  This however comes at the cost of latency, so the default
        // is to disable it.  If you don't need low latency and are streaming
        // lots of small messages, you can change this to 'false'
        disableNagleAlgorithm: true,
        
        // The number of milliseconds to wait after sending a close frame
        // for an acknowledgement to come back before giving up and just
        // closing the socket.
        closeTimeout: 5000
    };
    extend(this.config, config);
    
    // this.httpServer = httpServer;
    // if (typeof(pathRegExp) === 'string') {
    //     pathRegExp = new RegExp('^' + pathRegExp + '$');
    // }
    // this.pathRegExp = pathRegExp;
    // this.protocol = protocol;
    if (this.config.httpServer) {
        this.config.httpServer.on('upgrade', this._handlers.upgrade);
    }
    else {
        throw new Error("You must specify an httpServer on which to mount the WebSocket server.")
    }
};

WebSocketServer.prototype.unmount = function() {
    this.config.httpServer.removeListener('upgrade', this._handlers.upgrade);
};

WebSocketServer.prototype.closeAllConnections = function() {
    this.connections.forEach(function(connection) {
        connection.close();
    });
};

WebSocketServer.prototype.shutDown = function() {
    this.unmount();
    this.closeAllConnections();
};

WebSocketServer.prototype.handleUpgrade = function(request, socket, head) {
    try {
        var wsRequest = new WebSocketRequest(socket, request, this.config);
    }
    catch(e) {
        console.error((new Date()) + " WebSocket: Invalid handshake: " + e.toString());
        return;
    }

    wsRequest.once('requestAccepted', this._handlers.requestAccepted);
    
    if (!this.config.autoAcceptConnections && this.listeners('request').length > 0) {
        this.emit('request', wsRequest);
    }
    else if (this.config.autoAcceptConnections) {
        wsRequest.accept(wsRequest.requestedProtocols[0], wsRequest.origin);
    }
    else {
        wsRequest.reject(404, "No handler is configured to accept the connection.");
    }
};

WebSocketServer.prototype.handleRequestAccepted = function(connection) {
    connection.once('close', this._handlers.connectionClose);
    this.connections.push(connection);
    this.emit('connect', connection);
};
WebSocketServer.prototype.handleConnectionClose = function(connection) {
    var index = this.connections.indexOf(connection);
    if (index !== -1) {
        this.connections.splice(index, 1);
    }
    this.emit('close', connection);
};

module.exports = WebSocketServer;