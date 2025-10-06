/* eslint-disable no-redeclare */
let _globalThis;
if (typeof globalThis === 'object') {
  _globalThis = globalThis;
} else {
  try {
    _globalThis = require('es5-ext/global');
  } catch (error) {
    // eslint-disable-next-line no-empty
  } finally {
    if (!_globalThis && typeof window !== 'undefined') { _globalThis = window; }
    // eslint-disable-next-line no-unsafe-finally
    if (!_globalThis) { throw new Error('Could not determine global this'); }
  }
}

const NativeWebSocket = _globalThis.WebSocket || _globalThis.MozWebSocket;
const version = require('./version');


/**
 * Expose a W3C WebSocket class with just one or two arguments.
 */
function W3CWebSocket(uri, protocols) {
  let native_instance;

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
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((prop) => {
    Object.defineProperty(W3CWebSocket, prop, {
      get: () => NativeWebSocket[prop]
    });
  });
}

/**
 * Module exports.
 */
module.exports = {
  w3cwebsocket : NativeWebSocket ? W3CWebSocket : null,
  version
};
