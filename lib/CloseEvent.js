module.exports = CloseEvent;

function CloseEvent(wasClean, code, reason) {
  this.wasClean = wasClean || false;
  this.code = code || 0;
  this.reason = reason || "";
}