import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/benchmark/**/*.bench.mjs'],
    benchmark: {
      include: ['test/benchmark/**/*.bench.mjs'],
      exclude: ['node_modules/', 'test/unit/', 'test/integration/'],
    },
  },
});
