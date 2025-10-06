#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parseResults } = require('./parse-results.js');

class AutobahnTestRunner {
  constructor() {
    this.echoServerProcess = null;
    this.dockerProcess = null;
    this.cleanup = this.cleanup.bind(this);
    
    // Handle process termination gracefully
    process.on('SIGINT', this.cleanup);
    process.on('SIGTERM', this.cleanup);
    process.on('exit', this.cleanup);
  }

  async run() {
    console.log('🚀 Starting comprehensive Autobahn WebSocket test suite...\n');
    
    try {
      // Step 1: Start echo server
      await this.startEchoServer();
      
      // Step 2: Wait for echo server to be ready
      await this.waitForEchoServer();
      
      // Step 3: Run Autobahn test suite
      await this.runAutobahnTests();
      
      // Step 4: Parse and display results
      this.parseAndDisplayResults();
      
    } catch (error) {
      console.error('❌ Test run failed:', error.message);
      process.exit(1);
    } finally {
      // Step 5: Cleanup
      this.cleanup();
    }
  }

  startEchoServer() {
    return new Promise((resolve, reject) => {
      console.log('📡 Starting echo server...');
      
      const echoServerPath = path.join(__dirname, '..', 'scripts', 'echo-server.js');
      this.echoServerProcess = spawn('node', [echoServerPath, '--port=8080'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      let serverStarted = false;

      this.echoServerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`   ${output.trim()}`);
        
        if (output.includes('Server is listening on port 8080') && !serverStarted) {
          serverStarted = true;
          resolve();
        }
      });

      this.echoServerProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('EADDRINUSE')) {
          reject(new Error('Port 8080 is already in use. Please stop any existing echo servers.'));
        } else {
          console.error(`Echo server error: ${error}`);
        }
      });

      this.echoServerProcess.on('error', (error) => {
        reject(new Error(`Failed to start echo server: ${error.message}`));
      });

      this.echoServerProcess.on('exit', (code, signal) => {
        if (!serverStarted && code !== 0) {
          reject(new Error(`Echo server exited with code ${code} (signal: ${signal})`));
        }
      });

      // Timeout if server doesn't start within 10 seconds
      setTimeout(() => {
        if (!serverStarted) {
          reject(new Error('Echo server failed to start within 10 seconds'));
        }
      }, 10000);
    });
  }

  waitForEchoServer() {
    return new Promise((resolve) => {
      console.log('⏳ Waiting for echo server to be ready...');
      // Give the server a moment to fully initialize
      setTimeout(() => {
        console.log('✅ Echo server is ready\n');
        resolve();
      }, 1000);
    });
  }

  runAutobahnTests() {
    return new Promise((resolve, reject) => {
      console.log('🐳 Starting Autobahn test suite with Docker...');

      // Get current commit SHA (fallback to 'unknown' if not in git repo)
      const { execSync } = require('child_process');
      let commitSha = 'unknown';
      try {
        commitSha = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      } catch (error) {
        // Not in a git repo or git not available
        console.log('   Warning: Unable to determine commit SHA, using "unknown"');
      }

      // Detect platform and use appropriate config and networking
      const isLinux = process.platform === 'linux';
      const baseConfigFile = isLinux ? 'fuzzingclient-linux.json' : 'fuzzingclient.json';
      const configFile = `${baseConfigFile.replace('.json', '')}-temp.json`;

      console.log(`   Platform: ${process.platform}, commit: ${commitSha}, using config: ${configFile}`);

      // Generate config file with commit SHA
      const baseConfigPath = path.join(process.cwd(), 'config', baseConfigFile);
      const tempConfigPath = path.join(process.cwd(), 'config', configFile);

      try {
        const configContent = fs.readFileSync(baseConfigPath, 'utf8');
        const modifiedConfig = configContent.replace(
          /"agent":\s*"WebSocket-Node[^"]*"/,
          `"agent": "WebSocket-Node@${commitSha}"`
        );
        fs.writeFileSync(tempConfigPath, modifiedConfig);
      } catch (error) {
        reject(new Error(`Failed to generate config file: ${error.message}`));
        return;
      }

      const dockerArgs = [
        'run',
        '--rm',
        ...(isLinux ? ['--network=host'] : ['-p', '9001:9001']),
        '-v', `${process.cwd()}/config:/config`,
        '-v', `${process.cwd()}/reports:/reports`,
        '--name', 'fuzzingclient',
        'crossbario/autobahn-testsuite',
        'wstest', '-m', 'fuzzingclient', '--spec', `/config/${configFile}`
      ];

      this.dockerProcess = spawn('docker', dockerArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.dockerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Show progress without overwhelming the console
        if (output.includes('Case ') || output.includes('OK') || output.includes('PASS') || output.includes('FAIL')) {
          process.stdout.write('.');
        }
      });

      this.dockerProcess.stderr.on('data', (data) => {
        const error = data.toString();
        // Don't show Docker warnings unless they're critical
        if (!error.includes('WARNING') && !error.includes('deprecated')) {
          console.error(`Docker error: ${error}`);
        }
      });

      this.dockerProcess.on('error', (error) => {
        reject(new Error(`Failed to run Docker: ${error.message}`));
      });

      this.dockerProcess.on('exit', (code, signal) => {
        console.log('\n'); // New line after progress dots
        
        if (code === 0) {
          console.log('✅ Autobahn test suite completed successfully\n');
          resolve();
        } else {
          reject(new Error(`Docker process exited with code ${code} (signal: ${signal})`));
        }
      });
    });
  }

  parseAndDisplayResults() {
    console.log('📊 Parsing test results...\n');

    const resultsPath = path.join(__dirname, 'reports', 'servers', 'index.json');

    if (!fs.existsSync(resultsPath)) {
      console.error('❌ Results file not found. Tests may not have completed properly.');
      process.exit(1);
    }

    try {
      const originalProcessExit = process.exit;
      let exitCode = 0;

      // Intercept process.exit to capture the exit code
      process.exit = (code) => {
        exitCode = code || 0;
      };

      const summary = parseResults();

      // Restore original function
      process.exit = originalProcessExit;

      // Exit with appropriate code if there were failures
      if (exitCode !== 0 || (summary && summary.failed > 0)) {
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Failed to parse results:', error.message);
      process.exit(1);
    }
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');

    if (this.dockerProcess && !this.dockerProcess.killed) {
      console.log('   Stopping Docker container...');
      this.dockerProcess.kill('SIGTERM');
    }

    if (this.echoServerProcess && !this.echoServerProcess.killed) {
      console.log('   Stopping echo server...');
      this.echoServerProcess.kill('SIGTERM');

      // Force kill if it doesn't stop gracefully
      setTimeout(() => {
        if (this.echoServerProcess && !this.echoServerProcess.killed) {
          this.echoServerProcess.kill('SIGKILL');
        }
      }, 2000);
    }

    // Clean up temporary config files
    try {
      const tempConfigs = [
        path.join(__dirname, 'config', 'fuzzingclient-temp.json'),
        path.join(__dirname, 'config', 'fuzzingclient-linux-temp.json')
      ];
      tempConfigs.forEach(configPath => {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      });
    } catch (error) {
      console.log(`   Warning: Failed to clean up temp config files: ${error.message}`);
    }

    console.log('✅ Cleanup complete');
  }
}

// Check if we're in the right directory
if (!fs.existsSync(path.join(__dirname, 'config')) || !fs.existsSync(path.join(__dirname, '..', 'scripts', 'echo-server.js'))) {
  console.error('❌ Please run this script from the test/autobahn directory');
  process.exit(1);
}

// Run the test suite
if (require.main === module) {
  const runner = new AutobahnTestRunner();
  runner.run().catch((error) => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  });
}

module.exports = { AutobahnTestRunner };