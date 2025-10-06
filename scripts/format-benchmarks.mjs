#!/usr/bin/env node

import { readFileSync } from 'fs';

function addCommas(num) {
  const str = num.toString();
  if (str.length <= 3) return str;
  return addCommas(str.slice(0, -3)) + ',' + str.slice(-3);
}

function formatNumber(num, decimals = 2) {
  return (Math.round(num * 100) / 100).toString();
}

function formatBenchmarkResults(jsonFile) {
  const data = JSON.parse(readFileSync(jsonFile, 'utf8'));

  const lines = [];
  lines.push('## 📊 Performance Benchmark Results');
  lines.push('');
  lines.push('| Benchmark | Hz | Min | Max | Mean | P75 | P99 | P995 | P999 |');
  lines.push('|-----------|-------|------|------|------|------|------|------|------|');

  let totalBenchmarks = 0;

  for (const file of data.files) {
    for (const group of file.groups) {
      for (const benchmark of group.benchmarks) {
        totalBenchmarks++;

        const row = [
          benchmark.name,
          addCommas(Math.floor(benchmark.hz)),
          formatNumber(benchmark.min),
          formatNumber(benchmark.max),
          formatNumber(benchmark.mean),
          formatNumber(benchmark.p75),
          formatNumber(benchmark.p99),
          formatNumber(benchmark.p995),
          formatNumber(benchmark.p999)
        ];

        lines.push('| ' + row.join(' | ') + ' |');
      }
    }
  }

  lines.push('');
  lines.push(`_Total benchmarks: ${totalBenchmarks}_`);
  lines.push('');

  return lines.join('\n');
}

// Main execution
const jsonFile = process.argv[2] || 'bench-results.json';

try {
  const markdown = formatBenchmarkResults(jsonFile);
  console.log(markdown);
} catch (error) {
  console.error('Error formatting benchmark results:', error.message);
  process.exit(1);
}
