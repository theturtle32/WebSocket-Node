function WebSocketRouterRequest(webSocketRequest, resolvedProtocol) {
    this.webSocketRequest = webSocketRequest;
    if (resolvedProtocol === '____no_protocol____') {
        this.protocol = null;
    }
    else {
        this.protocol = resolvedProtocol;
    }
    this.origin = webSocketRequest.origin;
    this.resource = webSocketRequest.resource;
    this.httpRequest = webSocketRequest.httpRequest;
    this.remoteAddress = webSocketRequest.remoteAddress;
};

WebSocketRouterRequest.prototype.accept = function(origin) {
    return this.webSocketRequest.accept(this.protocol, origin);
};

WebSocketRouterRequest.prototype.reject = function(status, reason) {
    return this.webSocketRequest.reject(status, reason);
};

module.exports = WebSocketRouterRequest;