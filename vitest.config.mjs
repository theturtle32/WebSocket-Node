import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use single thread for test stability and to avoid port conflicts
        singleThread: true
      }
    },
    // Timeouts for WebSocket operations
    testTimeout: 15000,
    hookTimeout: 15000,
    // File patterns for test discovery
    include: [
      'test/**/*.{test,spec}.{js,mjs,ts}',
      'test/smoke.test.mjs'
    ],
    exclude: [
      'node_modules/',
      'test/autobahn/',
      'test/scripts/',
      'test/fixtures/',
      'test/shared/',
      'test/helpers/'
    ],
    // Setup files for global test configuration
    setupFiles: ['test/shared/setup.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'example/',
        'docs/',
        'lib/version.js',
        '**/*.test.{js,mjs,ts}',
        '**/*.spec.{js,mjs,ts}'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      // Include source files
      include: ['lib/**/*.js']
    }
  }
});