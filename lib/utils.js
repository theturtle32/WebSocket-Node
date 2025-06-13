const noop = exports.noop = () => {};

exports.extend = function extend(dest, source) {
  for (const prop in source) {
    dest[prop] = source[prop];
  }
};

exports.eventEmitterListenerCount =
    require('events').EventEmitter.listenerCount ||
    ((emitter, type) => emitter.listeners(type).length);

exports.bufferAllocUnsafe = Buffer.allocUnsafe ?
  Buffer.allocUnsafe :
  (size) => new Buffer(size);

exports.bufferFromString = Buffer.from ?
  Buffer.from :
  (string, encoding) => new Buffer(string, encoding);

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

BufferingLogger.prototype.printOutput = function(logFunction) {
  if (!logFunction) { logFunction = this.logFunction; }
  const uniqueID = this.uniqueID;
  this.buffer.forEach(([timestamp, argsArray]) => {
    const date = timestamp.toLocaleString();
    const args = argsArray.slice();
    let formatString = args[0];
    if (formatString !== (void 0) && formatString !== null) {
      formatString = `%s - %s - ${formatString.toString()}`;
      args.splice(0, 1, formatString, date, uniqueID);
      logFunction.apply(global, args);
    }
  });
};
