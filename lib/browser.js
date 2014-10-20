function NotSupported() {
    throw new Error("Sorry, WebSocket-Node isn't supported in the browser at this time.");
}

module.exports = {
    "server"     : NotSupported,
    "client"     : NotSupported,
    "router"     : NotSupported,
    "frame"      : NotSupported,
    "request"    : NotSupported,
    "connection" : NotSupported,
    "constants"  : NotSupported,
    "deprecation": NotSupported,
    "version"    : require('./version')
};
