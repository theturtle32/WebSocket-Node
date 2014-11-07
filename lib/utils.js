exports.extend = function extend(dest, source) {
    for (var prop in source) {
        dest[prop] = source[prop];
    }
};

exports.eventEmitterListenerCount =
    require('events').EventEmitter.listenerCount ||
    function(emitter, type) { return emitter.listeners(type).length; };
