# WebSocket-Node Performance Benchmarks

This directory contains performance benchmarks for critical WebSocket operations using Vitest's built-in benchmarking functionality.

## Running Benchmarks

```bash
# Run all benchmarks
pnpm run bench

# Save current results as baseline
pnpm run bench:baseline

# Compare with baseline (shows ⇑/⇓ indicators)
pnpm run bench:compare

# Check for regressions (exits with error on performance drops)
pnpm run bench:check
```

Note: `bench:check` is the same as `bench:compare` but is intended for CI environments where you want the build to fail on performance regressions.

## Benchmark Suites

### Frame Operations (`frame-operations.bench.mjs`)
Tests the performance of WebSocket frame serialization:
- Small text frames (17 bytes) - unmasked and masked
- Medium binary frames (1KB)
- Large binary frames (64KB)

**Typical Results:**
- Frame serialization: ~4.3M ops/sec (unmasked), ~3M ops/sec (masked)
- Larger frames maintain similar performance due to efficient buffering

### Connection Operations (`connection-operations.bench.mjs`)
Tests WebSocket connection-level operations:
- Connection instance creation
- Sending UTF-8 messages (small and 1KB)
- Sending binary messages (1KB)
- Ping/Pong frames

**Typical Results:**
- Connection creation: ~30K ops/sec
- Message sending: ~25-35K ops/sec
- Ping/Pong: ~33-35K ops/sec

## Interpreting Results

Benchmarks output operations per second (hz) and timing statistics:
- **hz**: Operations per second (higher is better)
- **mean**: Average time per operation
- **p75/p99**: 75th/99th percentile latencies
- **rme**: Relative margin of error (lower is better)

## Performance Baselines

Baseline results are stored in `baseline.json` using Vitest's JSON format. When running `bench:compare` or `bench:check`, Vitest automatically compares current results against the baseline and shows:
- `[1.05x] ⇑` for improvements (faster)
- `[0.95x] ⇓` for regressions (slower)
- Baseline values for reference

Expected performance ranges:
1. Frame serialization: 3-4.5M ops/sec
2. Message sending: 100K-900K ops/sec (varies by size)
3. Ping/Pong: 1.5-2M ops/sec
4. Connection creation: 30K ops/sec

## Benchmark Structure

Each operation is in its own `describe` block to prevent Vitest from treating them as alternative implementations for comparison. This structure ensures each operation is measured independently:

```javascript
describe('Send Ping Frame', () => {
  bench('send ping frame', () => {
    sharedConnection.ping();
  });
});
```

## Adding New Benchmarks

When adding benchmarks:
1. Pre-allocate buffers and data outside the benchmark loop
2. Create shared connections at module scope (not inside benchmark functions)
3. Use descriptive test names with size information
4. Put each unique operation in its own `describe` block
5. Focus on operations that directly impact production performance
6. Avoid testing implementation details
