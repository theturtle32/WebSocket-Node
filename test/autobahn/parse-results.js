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
    informationalTests: []
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
  }
  
  // Print summary
  console.log('Test Summary:');
  console.log(`  Total tests: ${summary.total}`);
  console.log(`  Passed (OK): ${summary.ok}`);
  console.log(`  Failed: ${summary.failed}`);
  console.log(`  Non-Strict: ${summary.nonStrict}`);
  console.log(`  Informational: ${summary.informational}`);
  console.log(`  Unimplemented: ${summary.unimplemented}`);
  
  const passRate = ((summary.ok / summary.total) * 100).toFixed(1);
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
    console.log('\n=== UNIMPLEMENTED TESTS (Informational) ===');
    
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
  
  console.log('\n');
  
  // Exit with error code if there are actual failures
  if (summary.failed > 0) {
    console.error(`❌ ${summary.failed} test(s) failed!`);
    process.exit(1);
  } else {
    console.log(`✅ All tests passed! (${summary.ok} OK, ${summary.nonStrict} non-strict, ${summary.informational} informational, ${summary.unimplemented} unimplemented)`);
  }
}

if (require.main === module) {
  parseResults();
}

module.exports = { parseResults };