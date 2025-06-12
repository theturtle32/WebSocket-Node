const noop = exports.noop = function(){};

exports.extend = function extend(dest, source) {
  for (const prop in source) {
    dest[prop] = source[prop];
  }
};

exports.eventEmitterListenerCount =
    require('events').EventEmitter.listenerCount ||
    function(emitter, type) { return emitter.listeners(type).length; };

exports.bufferAllocUnsafe = Buffer.allocUnsafe ?
  Buffer.allocUnsafe :
  function oldBufferAllocUnsafe(size) { return new Buffer(size); };

exports.bufferFromString = Buffer.from ?
  Buffer.from :
  function oldBufferFromString(string, encoding) {
    return new Buffer(string, encoding);
  };

exports.BufferingLogger = function createBufferingLogger(identifier, uniqueID) {
  const logFunction = require('debug')(identifier);
  if (logFunction.enabled) {
    const logger = new BufferingLogger(identifier, uniqueID, logFunction);
    const debug = logger.log.bind(logger);
    debug.printOutput = logger.printOutput.bind(logger);
    debug.enabled = logFunction.enabled;
    return debug;
  }
  logFunction.printOutput = noop;
  return logFunction;
};

function BufferingLogger(identifier, uniqueID, logFunction) {
  this.logFunction = logFunction;
  this.identifier = identifier;
  this.uniqueID = uniqueID;
  this.buffer = [];
}

BufferingLogger.prototype.log = function() {
  this.buffer.push([ new Date(), Array.prototype.slice.call(arguments) ]);
  return this;
};

BufferingLogger.prototype.clear = function() {
  this.buffer = [];
  return this;
};

BufferingLogger.prototype.printOutput = function(logFunction = this.logFunction) {
  const uniqueID = this.uniqueID;
  this.buffer.forEach(function(entry) {
    const date = entry[0].toLocaleString();
    const args = entry[1].slice();
    let formatString = args[0];
    if (formatString !== (void 0) && formatString !== null) {
      formatString = `%s - %s - ${formatString.toString()}`;
      args.splice(0, 1, formatString, date, uniqueID);
      logFunction.apply(global, args);
    }
  });
};
