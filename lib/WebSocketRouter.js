var extend = require('./utils').extend;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketRouterRequest = require('./WebSocketRouterRequest');

function WebSocketRouter(config) {
    this.config = {
        // The WebSocketServer instance to attach to.
        server: null
    };
    if (config) {
        extend(this.config, config);
    }
    if (this.config.server) {
        this.attachServer(this.config.server);
    }
    this.handlers = [];
    
    this._requestHandler = this.handleRequest.bind(this);
};

util.inherits(WebSocketRouter, EventEmitter);

WebSocketRouter.prototype.attachServer = function(server) {
    if (server) {
        this.server = server;
        this.server.on('request', this._requestHandler);
    }
    else {
        throw new Error("You must specify a WebSocketServer instance to attach to.");
    }
};

WebSocketRouter.prototype.detachServer = function() {
    if (this.server) {
        this.server.removeListener('request', this._requestHandler);
        this.server = null;
    }
    else {
        throw new Error("Cannot detach from server: not attached.")
    }
};

WebSocketRouter.prototype.mount = function(path, protocol, callback) {
    if (!path) {
        throw new Error("You must specify a path for this handler.");
    }
    if (!protocol) {
        protocol = "____no_protocol____";
    }
    if (!callback) {
        throw new Error("You must specify a callback for this handler.");
    }

    var pathString;
    if (typeof(path) === 'string') {
        if (path === '*') {
            path = /^.*$/;
            pathString = '*'
        }
        else {
            path = new RegExp('^' + path + '$');
            pathString = path.toString();
        }
    }
    if (!(path instanceof RegExp)) {
        throw new Error("Path must be specified as either a string or a RegExp.");
    }
    
    // normalize protocol to lower-case
    protocol = protocol.toLocaleLowerCase();

    if (this.findHandlerIndex(pathString, protocol) !== -1) {
        throw new Error("You may only mount one handler per path/protocol combination.");
    }

    this.handlers.push({
        'path': path,
        'pathString': pathString,
        'protocol': protocol,
        'callback': callback
    });
};
WebSocketRouter.prototype.unmount = function(path, protocol) {
    var index = this.findHandlerIndex(path.toString(), protocol);
    if (index !== -1) {
        this.handlers.splice(index, 1);
    }
    else {
        throw new Error("Unable to find a route matching the specified path and protocol.");
    }
};

WebSocketRouter.prototype.findHandlerIndex = function(pathString, protocol) {
    protocol = protocol.toLocaleLowerCase();
    for (var i=0, len=this.handlers.length; i < len; i++) {
        var handler = this.handlers[i];
        if (handler.pathString === pathString && handler.protocol === protocol) {
            return i;
        }
    }
    return -1;
};

WebSocketRouter.prototype.handleRequest = function(request) {
    var requestedProtocols = request.requestedProtocols;
    if (requestedProtocols.length === 0) {
        requestedProtocols = ['____no_protocol____'];
    }
    
    // Find a handler with the first requested protocol first
    for (var i=0; i < requestedProtocols.length; i++) {
        var requestedProtocol = requestedProtocols[i];

        // find the first handler that can process this request 
        for (var j=0, len=this.handlers.length; j < len; j++) {
            var handler = this.handlers[j];
            if (handler.path.test(request.resource)) {
                if (requestedProtocol === handler.protocol ||
                    handler.protocol === '*')
                {
                    var routerRequest = new WebSocketRouterRequest(request, requestedProtocol);
                    handler.callback(routerRequest);
                    return;
                }
            }
        }
    }
    
    // If we get here we were unable to find a suitable handler.
    request.reject(404, "No handler is available for the given request.");
};

module.exports = WebSocketRouter;