var _global = (function() { return this; })();


/**
 * W3CWebSocket constructor.
 */
var W3CWebSocket = _global.WebSocket || _global.MozWebSocket;


/**
 * Module exports.
 */
module.exports = {
    'w3cwebsocket' : W3CWebSocket ? W3CWebSocket : null,
    'version'      : require('./version')
};
