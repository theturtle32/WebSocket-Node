var _global = (function() { return this; })();
var nativeWebSocket = _global.WebSocket || _global.MozWebSocket;


/**
 * Expose a W3C WebSocket class with just one or two arguments.
 */
function W3CWebSocket(uri, protocols) {
	var instance;

	if (protocols) {
		instance = new nativeWebSocket(uri, protocols);
	}
	else {
		instance = new nativeWebSocket(uri);
	}

	return instance;
}

if (nativeWebSocket) {
	W3CWebSocket.prototype = nativeWebSocket.prototype;
}


/**
 * Module exports.
 */
module.exports = {
    'w3cwebsocket' : nativeWebSocket ? W3CWebSocket : null,
    'version'      : require('./version')
};
