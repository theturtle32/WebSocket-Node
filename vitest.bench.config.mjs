import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    benchmark: {
      include: ['test/benchmark/**/*.bench.mjs'],
      exclude: ['node_modules/', 'test/unit/', 'test/integration/'],
    },
  },
});
