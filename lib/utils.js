var util = require('util');

exports.extend = function extend(dest, source) {
    for (var prop in source) {
        dest[prop] = source[prop];
    }
};

if ('debuglog' in util) {
    exports.debuglog = util.debuglog;
}
else {
    // Copied from util.js from node core.  This function was introduced in v0.11.3
    var debugs = {};
    var debugEnviron;
    function isUndefined(arg) {
        return arg === void 0;
    }
    exports.debuglog = function(set) {
        if (isUndefined(debugEnviron))
            debugEnviron = process.env.NODE_DEBUG || '';
        set = set.toUpperCase();
        if (!debugs[set]) {
            if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
                var pid = process.pid;
                debugs[set] = function() {
                    var msg = util.format.apply(util, arguments);
                    console.error('%s %d: %s', set, pid, msg);
                };
            } else {
                debugs[set] = function() {};
            }
        }
        return debugs[set];
    };    
}

exports.eventEmitterListenerCount =
    require('events').EventEmitter.listenerCount ||
    function(emitter, type) { return emitter.listeners(type).length; };
