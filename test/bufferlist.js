#!/usr/bin/env node
var sys = require('sys');
var Buffer = require('buffer').Buffer;
var BufferList = require('bufferlist').BufferList;

var b = new BufferList;
['abcde','xyz','11358'].forEach(function (s) {
    var buf = new Buffer(s.length);
    buf.write(s);
    b.write(buf);
});

sys.puts("Length: " + b.length);
sys.puts(b.take(5)); // abcdexyz11
b.advance(5);
sys.puts("Length: " + b.length);
sys.puts(b.take(5));
b.advance(5);
sys.puts("Length: " + b.length);
sys.puts(b.take(5));