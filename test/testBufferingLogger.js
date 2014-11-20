process.env['DEBUG'] = '*';

var utils = require('../lib/utils');
var debug = utils.BufferingLogger('testDebugger');

debug("Foo Bar Baz");
debug("%d %s", 45, "Hello World");
debug("%j", { hello: 'world' });

debug.printOutput();
