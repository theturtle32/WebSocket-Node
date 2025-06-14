import { spawn } from 'child_process';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function startEchoServer(outputStream, callback) {
  if ('function' === typeof outputStream) {
    callback = outputStream;
    outputStream = null;
  }
  if ('function' !== typeof callback) {
    callback = () => {};
  }
  
  const path = join(__dirname, '../scripts/echo-server.js');
    
  let echoServer = spawn('node', [path]);
  
  let state = 'starting';
  
  const processProxy = {
    kill: function(signal) {
      state = 'exiting';
      echoServer.kill(signal);
    }
  };
  
  if (outputStream) {
    echoServer.stdout.pipe(outputStream);
    echoServer.stderr.pipe(outputStream);
  }
  
  echoServer.stdout.on('data', (chunk) => {
    chunk = chunk.toString();
    if (/Server is listening/.test(chunk)) {
      if (state === 'starting') {
        state = 'ready';
        callback(null, processProxy);
      }
    }
  });

  echoServer.on('exit', (code, signal) => {
    echoServer = null;
    if (state !== 'exiting') {
      state = 'exited';
      callback(new Error(`Echo Server exited unexpectedly with code ${code}`));
    }
  });

  process.on('exit', () => {
    if (echoServer && state === 'ready') {
      echoServer.kill();
    }
  });
}