var _globalThis;

/**
 * core-js | Denis Pushkarev (zloirock) | MIT License
 *
 * https://github.com/zloirock/core-js/blob/977a3a49eb9473edf470cbc5c4257bd7c8c4da33/packages/core-js/internals/global-this.js#L1
 */
var checkGlobal = function (it) {
  return it && it.Math === Math && it;
};
var _globalThis =
	checkGlobal(typeof globalThis === 'object' && globalThis) ||
	checkGlobal(typeof window === 'object' && window) ||
	checkGlobal(typeof self === 'object' && self) ||
	checkGlobal(typeof global === 'object' && global) ||
	checkGlobal(typeof this === 'object' && this) ||
	(function () { return this; })();

if (!_globalThis) {
	throw new Error('Could not determine global this');
}

var NativeWebSocket = _globalThis.WebSocket || _globalThis.MozWebSocket;
var websocket_version = require('./version');


/**
 * Expose a W3C WebSocket class with just one or two arguments.
 */
function W3CWebSocket(uri, protocols) {
	var native_instance;

	if (protocols) {
		native_instance = new NativeWebSocket(uri, protocols);
	}
	else {
		native_instance = new NativeWebSocket(uri);
	}

	/**
	 * 'native_instance' is an instance of nativeWebSocket (the browser's WebSocket
	 * class). Since it is an Object it will be returned as it is when creating an
	 * instance of W3CWebSocket via 'new W3CWebSocket()'.
	 *
	 * ECMAScript 5: http://bclary.com/2004/11/07/#a-13.2.2
	 */
	return native_instance;
}
if (NativeWebSocket) {
	['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function(prop) {
		Object.defineProperty(W3CWebSocket, prop, {
			get: function() { return NativeWebSocket[prop]; }
		});
	});
}

/**
 * Module exports.
 */
module.exports = {
    'w3cwebsocket' : NativeWebSocket ? W3CWebSocket : null,
    'version'      : websocket_version
};
