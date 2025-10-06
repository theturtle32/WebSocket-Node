#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseResults() {
  const resultsPath = path.join(__dirname, 'reports', 'servers', 'index.json');
  
  if (!fs.existsSync(resultsPath)) {
    console.error('Results file not found:', resultsPath);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  
  if (!results || Object.keys(results).length === 0) {
    console.error('Results file is empty or invalid.');
    process.exit(1);
  }
  
  // Get the first (and presumably only) server implementation
  const serverName = Object.keys(results)[0];
  const testResults = results[serverName];
  
  console.log(`\n=== Autobahn Test Suite Results for ${serverName} ===\n`);
  
  const summary = {
    total: 0,
    ok: 0,
    failed: 0,
    nonStrict: 0,
    unimplemented: 0,
    informational: 0,
    failedTests: [],
    nonStrictTests: [],
    unimplementedTests: [],
    informationalTests: [],
    performance: {
      totalDuration: 0,
      testCount: 0,
      byCategory: {
        'limits': { tests: [], totalDuration: 0, description: '9.x - Limits/Performance' },
        'largeMessages': { tests: [], totalDuration: 0, description: '10.x - Large Messages' },
        'fragmentation': { tests: [], totalDuration: 0, description: '12.x - WebSocket Fragmentation' },
        'other': { tests: [], totalDuration: 0, description: 'Other Tests' }
      }
    }
  };
  
  // Category mapping for performance tests
  const categoryMap = {
    '9': 'limits',
    '10': 'largeMessages',
    '12': 'fragmentation'
  };

  // Parse each test case
  for (const [testCase, result] of Object.entries(testResults)) {
    summary.total++;

    const behavior = result.behavior;
    const behaviorClose = result.behaviorClose;

    if (behavior === 'OK' && behaviorClose === 'OK') {
      summary.ok++;
    } else if (behavior === 'UNIMPLEMENTED') {
      summary.unimplemented++;
      summary.unimplementedTests.push({
        case: testCase,
        behavior,
        behaviorClose,
        duration: result.duration
      });
    } else if (behavior === 'NON-STRICT') {
      summary.nonStrict++;
      summary.nonStrictTests.push({
        case: testCase,
        behavior,
        behaviorClose,
        duration: result.duration
      });
    } else if (behavior === 'INFORMATIONAL') {
      summary.informational++;
      summary.informationalTests.push({
        case: testCase,
        behavior,
        behaviorClose,
        duration: result.duration,
        remoteCloseCode: result.remoteCloseCode
      });
    } else {
      summary.failed++;
      summary.failedTests.push({
        case: testCase,
        behavior,
        behaviorClose,
        duration: result.duration,
        remoteCloseCode: result.remoteCloseCode
      });
    }

    // Track performance metrics
    if (result.duration !== undefined) {
      summary.performance.totalDuration += result.duration;
      summary.performance.testCount++;

      // Categorize performance tests
      const majorCategory = testCase.split('.')[0];
      const category = categoryMap[majorCategory] || 'other';

      summary.performance.byCategory[category].tests.push({
        testCase: testCase,
        duration: result.duration,
        description: result.description
      });
      summary.performance.byCategory[category].totalDuration += result.duration;
    }
  }
  
  // Print summary
  console.log('Test Summary:');
  console.log(`  Total tests: ${summary.total}`);
  console.log(`  Required tests: ${summary.total - summary.unimplemented}`);
  console.log(`  Optional tests: ${summary.unimplemented}`);
  console.log(`  Passed (OK): ${summary.ok}`);
  console.log(`  Failed: ${summary.failed}`);
  console.log(`  Non-Strict: ${summary.nonStrict}`);
  console.log(`  Informational: ${summary.informational}`);

  // Pass rate excludes optional, non-strict, and informational tests
  const strictRequired = summary.total - summary.unimplemented - summary.nonStrict - summary.informational;
  const passRate = strictRequired > 0
    ? ((summary.ok / strictRequired) * 100).toFixed(1)
    : '0.0';
  console.log(`  Pass rate: ${passRate}%`);
  
  // Print failed tests if any
  if (summary.failedTests.length > 0) {
    console.log('\n=== FAILED TESTS ===');
    summary.failedTests.forEach(test => {
      console.log(`  ${test.case}: behavior=${test.behavior}, behaviorClose=${test.behaviorClose}, closeCode=${test.remoteCloseCode}`);
    });
  }
  
  // Print non-strict tests if any
  if (summary.nonStrictTests.length > 0) {
    console.log('\n=== NON-STRICT TESTS (Informational) ===');
    summary.nonStrictTests.forEach(test => {
      console.log(`  ${test.case}: behavior=${test.behavior}, behaviorClose=${test.behaviorClose}`);
    });
  }
  
  // Print informational tests if any
  if (summary.informationalTests.length > 0) {
    console.log('\n=== INFORMATIONAL TESTS (Not failures) ===');
    summary.informationalTests.forEach(test => {
      console.log(`  ${test.case}: behavior=${test.behavior}, behaviorClose=${test.behaviorClose}, closeCode=${test.remoteCloseCode}`);
    });
  }
  
  // Print unimplemented tests summary (grouped by major version)
  if (summary.unimplementedTests.length > 0) {
    console.log('\n=== OPTIONAL FEATURES NOT IMPLEMENTED (Informational) ===');
    
    // Group by major test category
    const unimplementedByCategory = {};
    summary.unimplementedTests.forEach(test => {
      const majorCategory = test.case.split('.')[0];
      if (!unimplementedByCategory[majorCategory]) {
        unimplementedByCategory[majorCategory] = [];
      }
      unimplementedByCategory[majorCategory].push(test.case);
    });
    
    for (const [category, tests] of Object.entries(unimplementedByCategory)) {
      console.log(`  Category ${category}: ${tests.length} tests`);
      console.log(`    Cases: ${tests.join(', ')}`);
    }
  }
  
  // Print performance summary
  if (summary.performance.testCount > 0) {
    console.log('=== PERFORMANCE METRICS ===');
    console.log(`  Total test duration: ${summary.performance.totalDuration.toLocaleString()}ms`);
    console.log(`  Tests with timing data: ${summary.performance.testCount}`);
    console.log(`  Average duration: ${(summary.performance.totalDuration / summary.performance.testCount).toFixed(2)}ms\n`);

    // Print category breakdown for performance-focused tests
    const perfCategories = Object.keys(summary.performance.byCategory).filter(key => key !== 'other');
    let hasPerfData = false;

    for (const categoryKey of perfCategories) {
      const category = summary.performance.byCategory[categoryKey];
      if (category.tests.length > 0) {
        hasPerfData = true;
        const avgDuration = (category.totalDuration / category.tests.length).toFixed(2);
        console.log(`  ${category.description}:`);
        console.log(`    Tests: ${category.tests.length}`);
        console.log(`    Total duration: ${category.totalDuration.toLocaleString()}ms`);
        console.log(`    Average duration: ${avgDuration}ms`);

        // Show top 5 slowest tests in this category
        const slowestTests = [...category.tests]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 5);

        if (slowestTests.length > 0) {
          console.log('    Slowest tests:');
          slowestTests.forEach(test => {
            console.log(`      ${test.testCase}: ${test.duration}ms`);
          });
        }
        console.log('');
      }
    }

    if (!hasPerfData) {
      console.log('  No performance-focused tests (9.x, 10.x, 12.x) executed.\n');
    }
  }

  console.log('');

  // Exit with error code if there are actual failures
  if (summary.failed > 0) {
    console.error(`❌ ${summary.failed} test(s) failed!`);
    process.exit(1);
  } else {
    console.log(`✅ All tests passed! (${summary.ok} OK, ${summary.nonStrict} non-strict, ${summary.informational} informational, ${summary.unimplemented} unimplemented)`);
  }

  return summary;
}

if (require.main === module) {
  parseResults();
}

module.exports = { parseResults };