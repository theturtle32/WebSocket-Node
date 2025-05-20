module.exports = {
    'server'       : require('./WebSocketServer'),
    'client'       : require('./WebSocketClient'),
    'router'       : require('./WebSocketRouter'),
    'frame'        : require('./WebSocketFrame'),
    'request'      : require('./WebSocketRequest'),
    'connection'   : require('./WebSocketConnection'),
    'w3cwebsocket' : require('./W3CWebSocket'),
    'connection2w3cwebsocket': require('./W3CWebSocketWrapper').connToW3C,
    'deprecation'  : require('./Deprecation'),
    'version'      : require('./version')
};
