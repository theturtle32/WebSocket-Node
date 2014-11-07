module.exports = {
    "server"     : require('./WebSocketServer'),
    "client"     : require('./WebSocketClient'),
    "router"     : require('./WebSocketRouter'),
    "frame"      : require('./WebSocketFrame'),
    "request"    : require('./WebSocketRequest'),
    "connection" : require('./WebSocketConnection'),
    "deprecation": require('./Deprecation'),
    "version"    : require('./version')
};
