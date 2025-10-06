#!/usr/bin/env node

/**
 * Performance Baseline Tracking Script
 *
 * This script runs benchmarks and tracks performance over time.
 * It can save baselines and compare current performance against them.
 *
 * Usage:
 *   node test/benchmark/track-performance.mjs save     # Save current results as baseline
 *   node test/benchmark/track-performance.mjs compare  # Compare with baseline
 *   node test/benchmark/track-performance.mjs check    # Check for regressions (CI)
 */

import { exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);
const BASELINE_FILE = 'test/benchmark/baseline.json';
const REGRESSION_THRESHOLD = 0.15; // 15% regression threshold

async function runBenchmarks() {
  console.log('Running benchmarks...');
  const { stdout } = await execAsync('pnpm run bench 2>&1');
  return parseBenchmarkOutput(stdout);
}

function parseBenchmarkOutput(output) {
  const results = {};
  const lines = output.split('\n');

  let currentSuite = null;
  for (const line of lines) {
    // Detect suite name
    if (line.includes('> WebSocket')) {
      currentSuite = line.match(/> (.*)/)[1].trim();
      // Don't initialize suite here - wait until first benchmark is found
    }

    // Parse benchmark results
    const benchMatch = line.match(/^\s*[·•]\s+(.+?)\s+(\d+(?:,\d+)*(?:\.\d+)?)\s/);
    if (benchMatch && currentSuite) {
      const [, name, hz] = benchMatch;
      // Lazily initialize suite only when first benchmark is found
      if (!results[currentSuite]) {
        results[currentSuite] = {};
      }
      results[currentSuite][name.trim()] = parseFloat(hz.replace(/,/g, ''));
    }
  }

  return results;
}

async function saveBaseline() {
  const results = await runBenchmarks();
  writeFileSync(BASELINE_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    results
  }, null, 2));
  console.log(`\n✅ Baseline saved to ${BASELINE_FILE}`);
}

async function compareWithBaseline() {
  if (!existsSync(BASELINE_FILE)) {
    console.error(`❌ No baseline found at ${BASELINE_FILE}`);
    console.log('Run: node test/benchmark/track-performance.mjs save');
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
  const current = await runBenchmarks();

  console.log(`\n📊 Comparing with baseline from ${baseline.timestamp}\n`);

  let hasRegression = false;

  for (const [suite, tests] of Object.entries(current)) {
    if (!baseline.results[suite]) continue;

    console.log(`\n${suite}:`);

    for (const [test, currentHz] of Object.entries(tests)) {
      const baselineHz = baseline.results[suite][test];
      if (!baselineHz) continue;

      const change = (currentHz - baselineHz) / baselineHz;
      const changePercent = (change * 100).toFixed(2);

      let status = '✓';
      if (change < -REGRESSION_THRESHOLD) {
        status = '❌ REGRESSION';
        hasRegression = true;
      } else if (change < -0.05) {
        status = '⚠️  SLOWER';
      } else if (change > 0.05) {
        status = '🚀 FASTER';
      }

      console.log(`  ${status} ${test}`);
      console.log(`    ${baselineHz.toLocaleString()} → ${currentHz.toLocaleString()} ops/sec (${changePercent}%)`);
    }
  }

  if (hasRegression) {
    console.log(`\n❌ Performance regressions detected (>${REGRESSION_THRESHOLD * 100}% slower)`);
    process.exit(1);
  } else {
    console.log('\n✅ No performance regressions detected');
  }
}

const command = process.argv[2];

if (command === 'save') {
  await saveBaseline();
} else if (command === 'compare' || command === 'check') {
  await compareWithBaseline();
} else {
  console.log(`
Usage:
  node test/benchmark/track-performance.mjs save     # Save baseline
  node test/benchmark/track-performance.mjs compare  # Compare with baseline
  node test/benchmark/track-performance.mjs check    # Check for regressions (CI)
`);
  process.exit(1);
}
