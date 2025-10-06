# WebSocket-Node Performance Benchmarks

This directory contains performance benchmarks for critical WebSocket operations.

## Running Benchmarks

```bash
# Run all benchmarks
pnpm run bench

# Compare with previous results
pnpm run bench:compare
```

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

These benchmarks establish baseline performance for regression detection:
1. Frame serialization should maintain 4M+ ops/sec for small frames
2. Connection operations should maintain 25K+ ops/sec
3. Large message handling (64KB) should not degrade significantly

## Adding New Benchmarks

When adding benchmarks:
1. Pre-allocate buffers and data outside the benchmark loop
2. Use descriptive test names with size information
3. Focus on operations that directly impact production performance
4. Avoid testing implementation details
