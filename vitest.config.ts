import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{ts,js}',
        '**/*.d.ts',
        'tests/',
        '**/index.ts', // Re-export files
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
    include: ['tests/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      ...(process.platform !== 'win32' ? ['tests/**/*.test.ts'] : []),
    ],
  },
});
