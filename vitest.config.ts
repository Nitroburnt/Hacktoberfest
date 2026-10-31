import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['AutoEvolve_Test_Suite/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The ZK prover is CPU-bound and deterministic; keep runs isolated.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
